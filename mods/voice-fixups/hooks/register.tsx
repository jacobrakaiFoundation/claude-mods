import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

/** The prompts a person wrote: typed or dictated, sent over Remote Control, or given to `claude -p`. */
const PERSON_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge', 'sdk'])

const FILE = '.claude/voice-fixups.json'

/** Spoken phrase (normalized) to the text it is replaced with. */
type Fixups = ReadonlyMap<string, string>

/** Lower case, inner whitespace one space: how phrases are compared. */
const normalize = (phrase: string): string => phrase.trim().replace(/\s+/g, ' ').toLowerCase()

/** A fixups file or entry that does not read as fixups. */
class FixupsError extends Error {}

const entryOf = (source: string, phrase: string, written: unknown): [string, string] => {
  const key = normalize(phrase)
  if (key === '') throw new FixupsError(`voice-fixups: ${source}: a spoken phrase is empty`)
  if (typeof written !== 'string') {
    throw new FixupsError(`voice-fixups: ${source}: "${phrase}" must map to a string, got ${JSON.stringify(written)}`)
  }
  return [key, written]
}

/** Parses the `replacements` option, one "spoken => written" per entry; throws naming the bad entry. */
const parseOption = (entries: unknown): Fixups => {
  if (!Array.isArray(entries)) {
    throw new Error(`voice-fixups: option "replacements" must be a list of strings, got ${JSON.stringify(entries)}`)
  }
  return new Map(
    entries.map((entry: unknown, index) => {
      const parts = typeof entry === 'string' ? entry.split('=>') : []
      if (parts.length !== 2) {
        throw new Error(`voice-fixups: replacement ${index + 1} ${JSON.stringify(entry)} must read "spoken => written"`)
      }
      return entryOf(`replacement ${index + 1}`, parts[0] ?? '', (parts[1] ?? '').trim())
    }),
  )
}

/** Parses a fixups file's text: one JSON object of spoken phrase to written text. */
const parseFile = (path: string, text: string): Fixups => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new FixupsError(`voice-fixups: ${path} is not valid JSON: ${error.message}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new FixupsError(`voice-fixups: ${path} must hold one JSON object of "spoken": "written" pairs`)
  }
  return new Map(Object.entries(data).map(([phrase, written]) => entryOf(path, phrase, written)))
}

const readFile = async ($: EngineInterface, path: string): Promise<Fixups> =>
  (await $.fs.exists(path)) ? parseFile(path, await $.fs.read(path)) : new Map()

/** The option's fixups, then the user's file, then the project's: a later one wins on a phrase. */
const loadFixups = async ($: EngineInterface, fromOption: Fixups): Promise<Fixups> => {
  const home = await $.env.get('HOME')
  if (home === undefined || home === '') throw new Error('voice-fixups: HOME is not set, so ~/' + FILE + ' cannot be found')
  const root = await $.session.root()
  const user = await readFile($, `${home}/${FILE}`)
  const project = root === home ? new Map<string, string>() : await readFile($, `${root}/${FILE}`)
  return new Map([...fromOption, ...user, ...project])
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replaces each phrase where it stands as whole words, any case, longest phrase first, in one pass. */
const applyFixups = (text: string, fixups: Fixups): string => {
  if (fixups.size === 0) return text
  const alternatives = [...fixups.keys()]
    .sort((a, b) => b.length - a.length)
    .map(phrase => phrase.split(' ').map(escapeRegExp).join('\\s+'))
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return text.replace(pattern, match => {
    const written = fixups.get(normalize(match))
    if (written === undefined) throw new Error(`voice-fixups: matched "${match}" but no phrase normalizes to it`)
    return written
  })
}

export const register: Register = (on, options) => {
  const fromOption = parseOption(options.replacements)

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta === true || !PERSON_ORIGINS.has(e.origin.kind)) return next(e)
    let fixups: Fixups
    try {
      fixups = await loadFixups($, fromOption)
    } catch (error) {
      if (!(error instanceof FixupsError)) throw error
      // A bad file is shown in the transcript (a skipped hook is not, outside a plugin-folder session).
      $.ui.log(`${error.message}; this prompt entered without replacements`)
      return next(e)
    }
    return next({ ...e, text: applyFixups(e.text, fixups) })
  })
}
