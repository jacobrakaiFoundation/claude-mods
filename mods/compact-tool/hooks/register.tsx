import type { PluginOptions, Register, SessionCompactResult } from 'claude-code'

const PLUGIN = 'compact-tool'
const TOOL_NAME = 'compact'
const TOOL = `mcp__${PLUGIN}__${TOOL_NAME}`

const DESCRIPTION = [
  'Compacts this conversation: replaces the history so far with a summary, freeing context, the same as the user typing /compact.',
  'Use it only when the user asks you to compact, or in a long automated workflow (many items processed one after another) when a workflow file or the user tells you to compact between items.',
  'Do not use it on your own initiative in ordinary work, after small steps, in the middle of a task whose details you still need, or to discard instructions the user gave.',
  'Compaction cannot happen mid-turn, so it runs as soon as your current turn ends; end your turn right after calling this.',
  'Pass resume_prompt to have the work continue automatically after the compaction (it arrives as the next message); without it the session waits for the user.',
  'Pass min_context_percent to compact only when the context window is at least that full; below it the call does nothing and you carry on in the same turn.',
  'A session allows a limited number of these compactions; past the limit the call is refused.',
].join(' ')

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    instructions: {
      type: 'string',
      description: 'What the summary must keep or stress, as typed after /compact (e.g. "keep the list of finished chapters and the output format").',
    },
    min_context_percent: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Only compact when the context window is at least this many percent full.',
    },
    resume_prompt: {
      type: 'string',
      description: 'Sent as the next prompt once compaction is done, so the work continues (e.g. "Continue with the next chapter in current-task.md").',
    },
  },
  additionalProperties: false,
} as const

/** Reads and checks the one option; a value that is not a whole number of at least 1 fails the load. */
const maxCompactionsOf = (options: PluginOptions): number => {
  const { maxCompactions } = options
  if (typeof maxCompactions !== 'number' || !Number.isInteger(maxCompactions) || maxCompactions < 1) {
    throw new Error(
      `${PLUGIN}: option "maxCompactions" must be a whole number of at least 1, got ${JSON.stringify(maxCompactions)}`,
    )
  }
  return maxCompactions
}

/** The tool's input, checked: the model's arguments are external data. */
type CompactRequest = { instructions?: string; minContextPercent?: number; resumePrompt?: string }

/** Pure: the request from the call's arguments, or a message naming the bad field. */
export const parseRequest = (args: Readonly<Record<string, unknown>>): CompactRequest | { error: string } => {
  const { instructions, min_context_percent: minContextPercent, resume_prompt: resumePrompt } = args
  if (instructions !== undefined && typeof instructions !== 'string') {
    return { error: `instructions must be a string, got ${JSON.stringify(instructions)}` }
  }
  if (resumePrompt !== undefined && (typeof resumePrompt !== 'string' || resumePrompt.trim() === '')) {
    return { error: `resume_prompt must be a non-empty string, got ${JSON.stringify(resumePrompt)}` }
  }
  if (
    minContextPercent !== undefined &&
    (typeof minContextPercent !== 'number' || !(minContextPercent >= 0 && minContextPercent <= 100))
  ) {
    return { error: `min_context_percent must be a number from 0 to 100, got ${JSON.stringify(minContextPercent)}` }
  }
  return {
    ...(instructions !== undefined && instructions.trim() !== '' && { instructions: instructions.trim() }),
    ...(minContextPercent !== undefined && { minContextPercent }),
    ...(resumePrompt !== undefined && { resumePrompt }),
  }
}

/** The call's own arguments: everything on the event but the envelope's fields. */
const argsOf = (e: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const { tool: _tool, tool_use_id: _id, agentId: _agentId, ...args } = e
  return args
}

export const register: Register = (on, options) => {
  const maxCompactions = maxCompactionsOf(options)
  /** Compactions this tool ran in the current session; /clear starts a new session and the count again. */
  let compactions = 0
  /** The compaction the model asked for in the running turn, run when that turn ends with an answer. */
  let pending: CompactRequest | undefined
  /** While the queued /compact runs: the main conversation's compaction result, once one settles. */
  let compaction: { outcome?: SessionCompactResult } | undefined

  // /compact can only be queued where a person is at the prompt: under `-p` or the SDK no session is bound to
  // run it, so the tool is not offered there at all.
  on('session.start', async ($, e, next) => {
    if (!e.isInteractive) {
      $.ui.log(`${PLUGIN}: not a session a person is at (-p or the SDK), so the compact tool is not registered.`, {
        to: 'debug',
      })
      return next(e)
    }
    await $.tool.register({ name: TOOL_NAME, description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: true })
    return next(e)
  })

  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') compactions = 0
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (e.agentId !== undefined) {
      return { deny: `${TOOL} compacts the main conversation; a subagent (${e.agentId}) cannot call it.` }
    }
    const request = parseRequest(argsOf(e))
    if ('error' in request) return { deny: `${TOOL}: ${request.error}` }
    if (pending !== undefined) return { deny: `${TOOL}: a compaction is already scheduled for the end of this turn.` }
    if (compactions >= maxCompactions) {
      return {
        deny: `${TOOL}: this session already compacted ${compactions} times through this tool, its limit (the maxCompactions option); not compacting. Carry on, or ask the user to run /compact or /clear.`,
      }
    }

    // Claimed before any await, so a second call in the same message is refused.
    pending = request
    if (request.minContextPercent !== undefined) {
      const percent = await $.session.usage().then(
        ({ context }) => context.percent,
        (error: unknown) => {
          pending = undefined
          throw error
        },
      )
      if (percent === undefined) {
        pending = undefined
        return { deny: `${TOOL}: the context window's fill is not known yet, so min_context_percent cannot be checked.` }
      }
      if (percent < request.minContextPercent) {
        pending = undefined
        return { result: `Context is ${percent}% full, below ${request.minContextPercent}%: not compacting. Carry on in this turn.` }
      }
    }

    const then =
      request.resumePrompt === undefined
        ? 'The session then waits for the user.'
        : 'Afterwards your resume_prompt arrives as the next message.'
    return { result: `Compaction scheduled: it runs as soon as this turn ends. End your turn now. ${then}` }
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined || pending === undefined) return next(e)
    const request = pending
    pending = undefined
    if (e.reason !== 'answer') {
      $.ui.log(`${PLUGIN}: the turn ended (${e.reason}), so the requested compaction and resume prompt were dropped.`)
      return next(e)
    }
    // /compact cannot run inside a hook the turn waits on: queue it from a timer, run once the session is idle.
    $.clock.after(0, () => {
      compaction = {}
      $.command
        .run({ command: 'compact', args: request.instructions ?? '' })
        .then(({ text }) => {
          const outcome = compaction?.outcome
          if (outcome === undefined || outcome.skip !== undefined) {
            const why = outcome?.skip ?? `no compaction happened; /compact said: ${text ?? '(nothing)'}`
            $.ui.log(`${PLUGIN}: the requested compaction did not happen (${why}); resume prompt not sent.`)
            return undefined
          }
          compactions += 1
          return request.resumePrompt === undefined ? undefined : $.prompt.submit({ text: request.resumePrompt })
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          $.ui.log(`${PLUGIN}: compaction requested by the model failed: ${reason}`)
        })
        .finally(() => {
          compaction = undefined
        })
    })
    return next(e)
  })

  // Records whether the queued /compact compacted the main conversation or was vetoed.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (compaction !== undefined && e.agentId === undefined && e.trigger !== 'precompute') {
      compaction = { outcome: result }
    }
    return result
  })
}
