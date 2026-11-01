import type { ModelEffort, PromptOrigin, Register } from 'claude-code'

const LEVELS: readonly ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** The prompts a person wrote: typed, sent over Remote Control, or given to `claude -p`. */
const PERSON_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge', 'sdk'])

const TOKEN = '!(low|medium|high|xhigh|max)'
const LEADING_TOKEN = new RegExp(`^\\s*${TOKEN}(?=\\s|$)`, 'i')
const TRAILING_TOKEN = new RegExp(`(?:^|\\s)${TOKEN}\\s*$`, 'i')

/** A keyword rule: prompts starting with `phrase` (whole words, any case) run at `level`. */
type Rule = { phrase: string; level: ModelEffort }

/** A prompt's text with its effort token taken out, and the level the token or a rule chose. */
type Routed = { text: string; level: ModelEffort | undefined }

const isLevel = (value: string): value is ModelEffort => (LEVELS as readonly string[]).includes(value)

const levelOf = (token: string): ModelEffort => {
  const level = token.toLowerCase()
  if (!isLevel(level)) throw new Error(`effort-router: "${token}" is not one of ${LEVELS.join(', ')}`)
  return level
}

/** Lower case, inner whitespace one space: how rule phrases and prompt heads are compared. */
const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

/** A `rules` option that does not read as rules. */
class RulesError extends Error {}

/** Parses the `rules` option, one "phrase => level" per entry; throws naming the bad entry. */
const parseRules = (entries: unknown): Rule[] => {
  if (!Array.isArray(entries)) {
    throw new RulesError(`effort-router: option "rules" must be a list of strings, got ${JSON.stringify(entries)}`)
  }
  return entries.map((entry: unknown, index) => {
    const parts = typeof entry === 'string' ? entry.split('=>') : []
    const phrase = normalize(parts[0] ?? '')
    const level = parts[1]?.trim().toLowerCase() ?? ''
    if (parts.length !== 2 || phrase === '' || !isLevel(level)) {
      throw new RulesError(
        `effort-router: rule ${index + 1} ${JSON.stringify(entry)} must read "phrase => level", level one of ${LEVELS.join(', ')}`,
      )
    }
    return { phrase, level }
  })
}

const startsWithPhrase = (text: string, phrase: string): boolean => {
  const head = normalize(text)
  return head.startsWith(phrase) && !/[\p{L}\p{N}_]/u.test(head.charAt(phrase.length))
}

/** Takes a leading, else a trailing, effort token out of `text`; else applies the first matching rule. */
const route = (text: string, rules: readonly Rule[]): Routed => {
  const leading = LEADING_TOKEN.exec(text)
  if (leading?.[1] !== undefined) {
    return { text: text.slice(leading[0].length).trimStart(), level: levelOf(leading[1]) }
  }
  const trailing = TRAILING_TOKEN.exec(text)
  if (trailing?.[1] !== undefined) {
    return { text: text.slice(0, trailing.index).trimEnd(), level: levelOf(trailing[1]) }
  }
  return { text, level: rules.find(rule => startsWithPhrase(text, rule.phrase))?.level }
}

/** The rules, or why the `rules` option could not be read (reported in the transcript, tokens still work). */
const readRules = (entries: unknown): { rules: Rule[]; error: string | undefined } => {
  try {
    return { rules: parseRules(entries), error: undefined }
  } catch (error) {
    if (!(error instanceof RulesError)) throw error
    return { rules: [], error: `${error.message}; keyword rules are off until it is fixed in /config` }
  }
}

export const register: Register = (on, options) => {
  const { rules, error: rulesError } = readRules(options.rules)
  let rulesErrorShown = false

  // The level of the prompt whose turn starts inside its own next(e) (submitted while idle);
  // the levels of prompts queued behind a running turn, keyed by the text they entered with;
  // and each running turn's level.
  let starting: { level: ModelEffort | undefined } | undefined
  const queued = new Map<string, ModelEffort>()
  const turnLevels = new Map<string, ModelEffort>()

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta === true || !PERSON_ORIGINS.has(e.origin.kind)) return next(e)
    if (rulesError !== undefined && !rulesErrorShown) {
      rulesErrorShown = true
      $.ui.log(rulesError)
    }

    const routed = route(e.text, rules)
    if (routed.level !== undefined && routed.text === '' && (e.attachments?.length ?? 0) === 0) {
      return { drop: `effort-router: !${routed.level} needs a prompt beside it` }
    }
    if (e.turnId === undefined) {
      // Submitted while idle: its turn starts inside next(e).
      starting = { level: routed.level }
      try {
        return await next({ ...e, text: routed.text })
      } finally {
        starting = undefined
      }
    }
    // Submitted over a running turn: next(e) resolves once it is queued, and it either starts a
    // turn of its own later (matched by its text) or is delivered into the running turn (never applied).
    const entered = await next({ ...e, text: routed.text })
    if (entered.drop !== undefined) return entered
    if (routed.level === undefined) queued.delete(entered.text)
    else queued.set(entered.text, routed.level)
    return entered
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // A queued prompt is known by its text, so one of attachments alone ("") is never matched.
    const level = starting !== undefined ? starting.level : e.text === '' ? undefined : queued.get(e.text)
    queued.delete(e.text)
    starting = undefined
    if (level !== undefined) {
      turnLevels.set(e.turnId, level)
      $.ui.toast(`effort ${level} for this turn`)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const level = e.agentId === undefined ? turnLevels.get(e.turnId) : undefined
    if (level === undefined) return yield* next(e)
    if (e.effort === undefined) {
      turnLevels.delete(e.turnId)
      $.ui.toast(`effort-router: ${e.model} takes no effort setting; !${level} was not applied`)
      return yield* next(e)
    }
    return yield* next({ ...e, effort: level })
  })

  on('turn.complete', ($, e, next) => {
    turnLevels.delete(e.turnId)
    return next(e)
  })
}
