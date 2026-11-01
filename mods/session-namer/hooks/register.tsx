import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelApiError, ModelCompleteResult, Register } from 'claude-code'

const PLUGIN = 'session-namer'
const TOOL_NAME = 'rename_session'
/** Longest name the tool or the automatic title sets. */
const MAX_NAME_CHARS = 80
/** How much of the first prompt and answer the title model reads. */
const MAX_CONTEXT_CHARS = 2000
const TITLE_ATTEMPTS = 3
const TITLE_TIMEOUT_MS = 20_000
/** The wait before the second title attempt; doubled before each later one. */
const TITLE_BACKOFF_MS = 1_000
/** The API failures worth asking again: the next call may well succeed. */
const TRANSIENT_ERRORS: ReadonlySet<ModelApiError> = new Set(['rate_limit', 'overloaded', 'server_error'])
/** A prompt that asks for the session's name: a naming word beside a word for the session. */
const ASKS_FOR_NAME = /\b(re-?name|name|title)\b[\s\S]*\b(session|conversation|chat|thread)\b|\b(session|conversation|chat|thread)\b[\s\S]*\b(re-?name|name|title)\b/i

const pending = atom({ plugin: 'session-namer', key: 'pending' } as const, null)
const isNamed = atom({ plugin: 'session-namer', key: 'isNamed' } as const, false)
const isAutoNameTried = atom({ plugin: 'session-namer', key: 'isAutoNameTried' } as const, false)
const isPersonNamed = atom({ plugin: 'session-namer', key: 'isPersonNamed' } as const, false)
const firstPrompt = atom({ plugin: 'session-namer', key: 'firstPrompt' } as const, null)
const lastPrompt = atom({ plugin: 'session-namer', key: 'lastPrompt' } as const, null)

type Options = { autoName: boolean; titleModel: string }

const parseOptions = (options: Record<string, unknown>): Options => {
  const { autoName, titleModel } = options
  if (typeof autoName !== 'boolean') {
    throw new Error(`${PLUGIN}: option "autoName" must be a boolean, got ${JSON.stringify(autoName)}`)
  }
  if (typeof titleModel !== 'string' || titleModel.trim() === '') {
    throw new Error(`${PLUGIN}: option "titleModel" must be a non-empty string, got ${JSON.stringify(titleModel)}`)
  }
  return { autoName, titleModel: titleModel.trim() }
}

/** Pure: a name the tool accepts, or the reason it does not. */
export const checkName = (name: unknown): { name: string } | { reason: string } => {
  if (typeof name !== 'string') return { reason: `"name" must be a string, got ${JSON.stringify(name)}` }
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (trimmed === '') return { reason: '"name" is empty' }
  if (trimmed.length > MAX_NAME_CHARS) {
    return { reason: `"name" is ${trimmed.length} characters; at most ${MAX_NAME_CHARS}` }
  }
  return { name: trimmed }
}

/**
 * Pure: the session title in a model's reply: its first non-empty line without quotes,
 * markup or a closing period, cut to MAX_NAME_CHARS at a word. Throws on a reply with none.
 */
export const titleFromReply = (reply: string): string => {
  const line = reply
    .split('\n')
    .map(l => l.replace(/^[\s"'`*#_-]+|[\s"'`*_.]+$/g, '').replace(/^title:\s*/i, ''))
    .find(l => l !== '')
  if (line === undefined) throw new Error(`${PLUGIN}: the title model's reply holds no title: ${JSON.stringify(reply)}`)
  if (line.length <= MAX_NAME_CHARS) return line
  const cut = line.slice(0, MAX_NAME_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut
}

const clip = (text: string): string =>
  text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)} [...]` : text

type TitleFailure = Exclude<ModelCompleteResult, { isAnswered: true }>

const failureText = (result: TitleFailure): string =>
  result.reason === 'api-error'
    ? `api-error (status ${result.status === null ? 'none' : result.status}, ${result.error})`
    : result.reason

/** Pure: whether another call may succeed: a rate limit, overload, server error, lost connection or timeout. */
export const isTransient = (result: TitleFailure): boolean =>
  result.reason === 'aborted' ||
  (result.reason === 'api-error' && (result.status === null || TRANSIENT_ERRORS.has(result.error)))

/** Pure: whether the person's prompt asks to name or rename the session. */
export const asksForName = (prompt: string): boolean => ASKS_FOR_NAME.test(prompt)

/**
 * Asks the title model, retrying a transient failure after a growing wait; throws at the
 * first other failure, or with every attempt's failure once all failed.
 */
const askTitle = async ($: EngineInterface, model: string, firstPrompt: string, answer: string): Promise<string> => {
  const failures: string[] = []
  for (let attempt = 1; attempt <= TITLE_ATTEMPTS; attempt++) {
    if (attempt > 1) await $.clock.sleep(TITLE_BACKOFF_MS * 2 ** (attempt - 2))
    const result = await $.model.complete({
      model,
      system: 'You name coding sessions. Reply with one title of 2 to 6 words and nothing else: no quotes, no closing period.',
      prompt: `The session's first request:\n${clip(firstPrompt)}\n\nThe assistant's answer:\n${clip(answer)}`,
      maxTokens: 40,
      effort: 'low',
      timeoutMs: TITLE_TIMEOUT_MS,
    })
    if (result.isAnswered) return titleFromReply(result.text)
    failures.push(failureText(result))
    if (!isTransient(result)) {
      throw new Error(`${PLUGIN}: the title model "${model}" failed: ${failures.join('; ')}`)
    }
    $.ui.log(`${PLUGIN}: title attempt ${attempt}/${TITLE_ATTEMPTS} with model "${model}" failed: ${failures.at(-1)}`, {
      to: 'debug',
    })
  }
  throw new Error(`${PLUGIN}: the title model "${model}" failed ${TITLE_ATTEMPTS} times: ${failures.join('; ')}`)
}

/**
 * Runs `/rename <name>`. Called only once the turn has ended (from `turn.complete` or a timer):
 * `$.command.run` queues the command for when the session is idle and rejects inside a
 * `tool.call` hook. Not awaited by the caller, so a failure is said in the transcript.
 */
const rename = ($: EngineInterface, name: string): void => {
  $.command.run({ command: 'rename', args: name }).then(
    () => undefined,
    (error: unknown) => $.ui.log(`${PLUGIN}: /rename ${JSON.stringify(name)} failed: ${String(error)}`),
  )
}

/**
 * Whether anyone sees the session: a terminal or an attached app. A `claude -p` run or a bare
 * SDK host has no surface, and there the output of `/rename` would replace or join the answer.
 */
const hasSurface = async ($: EngineInterface): Promise<boolean> => (await $.session.surfaces()).length > 0

const registerTool = async ($: EngineInterface): Promise<void> => {
  await $.tool.register({
    name: TOOL_NAME,
    description:
      'Renames this Claude Code session (what /rename does). The new name shows once the current turn ends. ' +
      'Use it only when the user asks for a name, or when the session has no name yet. ' +
      'It refuses to replace a name the user set unless the current request asks to rename the session.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: `The new name, at most ${MAX_NAME_CHARS} characters.` },
      },
      required: ['name'],
    },
    isDeferred: false,
  })
}

const autoName = async ($: EngineInterface, model: string, request: string, answer: string): Promise<void> => {
  const title = await askTitle($, model, request, answer)
  // Named while the model wrote the title: theirs stands.
  if (await read($, isNamed)) return
  rename($, title)
}

export const register: Register = (on, options) => {
  const { autoName: isAutoNameOn, titleModel } = parseOptions(options)

  // Headless (`claude -p`, a bare SDK host) the tool is not offered: its `/rename` would print
  // into the run's result. An app that attaches a surface later gets it then.
  on('session.start', async ($, e, next) => {
    if (e.isInteractive || (await hasSurface($))) await registerTool($)
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    await registerTool($)
    return next(e)
  })

  // Each conversation starts afresh: at startup, after `/clear`, `/resume` or a fork. Its name
  // (`claude -n`, a resumed session's, the one `/clear` carries over) stands and is not
  // auto-titled. Where it came from is unknown, so it counts as the person's, but for the one
  // `/clear` carries over, which keeps whoever set it.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source !== 'compact') {
      const isTitled = (e.session_title ?? '').trim() !== ''
      const wasPersonNamed = await read($, isPersonNamed)
      await update($, pending, () => null)
      await update($, isNamed, () => isTitled)
      await update($, isPersonNamed, () => isTitled && (e.source !== 'clear' || wasPersonNamed))
      await update($, isAutoNameTried, () => false)
      await update($, firstPrompt, () => null)
      await update($, lastPrompt, () => null)
    }
    return next(e)
  })

  // The person's first request is what the title describes, their latest whether they asked for a
  // name: not a slash command's row (a /color or /rename) nor a prompt the person does not see.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta === undefined && e.text.trim() !== '') {
      await update($, lastPrompt, () => e.text)
      if ((await read($, firstPrompt)) === null) await update($, firstPrompt, () => e.text)
    }
    return next(e)
  })

  // A `/rename` by the person, the SDK or this mod names the session. Another plugin's
  // (a project prefix set at start) does not: that one is not a title of the work.
  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.origin.kind !== 'plugin' || e.origin.name === PLUGIN) await update($, isNamed, () => true)
    if (e.origin.kind !== 'plugin') await update($, isPersonNamed, () => true)
    return ran
  })

  on('tool.call', { tool: 'mcp__session-namer__rename_session' }, async ($, e) => {
    const checked = checkName(e.name)
    if ('reason' in checked) return { deny: `${TOOL_NAME}: ${checked.reason}.` }
    const prompt = await read($, lastPrompt)
    if ((await read($, isPersonNamed)) && (prompt === null || !asksForName(prompt))) {
      return {
        deny:
          `${TOOL_NAME}: the user named this session and did not ask to rename it in their current request; ` +
          'the name stays. Rename it only when the user asks.',
      }
    }
    await update($, pending, () => checked.name)
    return { result: `The session will be renamed to "${checked.name}" when this turn ends.` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || !(await hasSurface($))) return done

    const name = await read($, pending)
    if (name !== null) {
      await update($, pending, () => null)
      await update($, isNamed, () => true)
      rename($, name)
      return done
    }

    const request = await read($, firstPrompt)
    if (
      !isAutoNameOn ||
      e.reason !== 'answer' ||
      request === null ||
      (await read($, isNamed)) ||
      (await read($, isAutoNameTried))
    ) {
      return done
    }
    await update($, isAutoNameTried, () => true)
    // Off the turn's end, so the title model's call does not hold the turn open.
    $.clock.after(1, () => {
      autoName($, titleModel, request, e.answer).catch((error: unknown) =>
        $.ui.log(`${PLUGIN}: automatic title failed: ${error instanceof Error ? error.message : String(error)}`),
      )
    })
    return done
  })
}
