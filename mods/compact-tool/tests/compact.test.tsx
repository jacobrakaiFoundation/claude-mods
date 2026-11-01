import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionCompactResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const TOOL = 'mcp__compact-tool__compact'
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

/** The end of the main loop's turn, as the engine raises it. */
const turnEnd = (reason: 'answer' | 'aborted') =>
  ({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason }) as const

/**
 * Stands for the engine beneath the plugin, recording the commands and prompts the plugin queues.
 * Its /compact raises `session.compact`, which answers `compacted`.
 */
const engine = ($: Engine, on: On, contextPercent: number, compacted: SessionCompactResult) => {
  const commands: string[] = []
  const logs: string[] = []
  const prompts: string[] = []
  const deferrals: Array<boolean | undefined> = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => {
    deferrals.push(e.isDeferred)
    return { value: { tool: `mcp__compact-tool__${e.name}` } }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, percent: contextPercent }, rateLimits: [] },
  }))
  on('session.compact', () => compacted)
  on('command.run', async (_, e) => {
    commands.push(`/${e.command} ${e.args}`)
    const { skip } = await $.session.compact({
      trigger: 'manual',
      instructions: e.args,
      messages: [{ role: 'user', text: 'chapter one', toolUses: [] }],
    })
    return { text: skip ?? 'Compacted' }
  })
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { commands, prompts, deferrals, logs }
}

const COMPACTED: SessionCompactResult = { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }

const CALL = {
  tool: TOOL,
  instructions: 'keep the list of finished chapters',
  min_context_percent: 60,
  resume_prompt: 'Continue with the next chapter.',
} as const

test('the tool waits behind ToolSearch; at the turn end it runs /compact, then the resume prompt', async ($, on) => {
  const clock = mock.clock(on, {})
  const { commands, prompts, deferrals } = engine($, on, 70, COMPACTED)
  await $.session.start(START)
  expect(deferrals).toEqual([true])

  const answer = await $.tool.call(CALL)
  expect(answer.result).toMatch(/^Compaction scheduled/)
  await clock.settle()
  expect(commands).toEqual([])

  await $.turn.complete(turnEnd('answer'))
  await clock.settle()
  expect(commands).toEqual(['/compact keep the list of finished chapters'])
  expect(prompts).toEqual(['Continue with the next chapter.'])
})

test('an interrupted turn drops the compaction and the resume prompt', async ($, on) => {
  const clock = mock.clock(on, {})
  const { commands, prompts } = engine($, on, 70, COMPACTED)
  await $.session.start(START)

  await $.tool.call(CALL)
  await $.turn.complete(turnEnd('aborted'))
  await clock.settle()
  expect(commands).toEqual([])
  expect(prompts).toEqual([])
})

test('a vetoed compaction sends no resume prompt', async ($, on) => {
  const clock = mock.clock(on, {})
  const { commands, prompts, logs } = engine($, on, 70, { skip: 'blocked by a PreCompact hook' })
  await $.session.start(START)

  await $.tool.call(CALL)
  await $.turn.complete(turnEnd('answer'))
  await clock.settle()
  expect(commands).toEqual(['/compact keep the list of finished chapters'])
  expect(prompts).toEqual([])
  expect(logs).toEqual([
    'compact-tool: the requested compaction did not happen (blocked by a PreCompact hook); resume prompt not sent.',
  ])
})

test('two calls in one message schedule one compaction', async ($, on) => {
  engine($, on, 70, COMPACTED)
  await $.session.start(START)

  const answers = await Promise.all([$.tool.call(CALL), $.tool.call(CALL)])
  expect(answers.filter(a => a.result !== undefined)).toHaveLength(1)
  expect(answers.filter(a => a.deny !== undefined)).toHaveLength(1)
})

test('below the threshold nothing is compacted', async ($, on) => {
  const clock = mock.clock(on, {})
  const { commands } = engine($, on, 30, COMPACTED)
  await $.session.start(START)

  const answer = await $.tool.call({ tool: TOOL, min_context_percent: 60 })
  await $.turn.complete(turnEnd('answer'))
  await clock.settle()
  expect(answer.result).toBe('Context is 30% full, below 60%: not compacting. Carry on in this turn.')
  expect(commands).toEqual([])
})

test('a bad argument is refused, naming it', async ($, on) => {
  engine($, on, 70, COMPACTED)
  await $.session.start(START)
  const answer = await $.tool.call({ tool: TOOL, min_context_percent: 'lots' })
  expect(answer.deny).toBe('mcp__compact-tool__compact: min_context_percent must be a number from 0 to 100, got "lots"')
})

test('a -p run, where /compact cannot be queued, gets no tool', async ($, on) => {
  const { deferrals } = engine($, on, 70, COMPACTED)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect(deferrals).toEqual([])
})

/** Calls the tool, ends the turn with an answer and lets the queued /compact run. */
const compactOnce = async ($: Engine, clock: ReturnType<typeof mock.clock>) => {
  const answer = await $.tool.call(CALL)
  await $.turn.complete(turnEnd('answer'))
  await clock.settle()
  return answer
}

test('past maxCompactions the tool refuses, until /clear', { options: { maxCompactions: 2 } }, async ($, on) => {
  const clock = mock.clock(on, {})
  const { commands, prompts } = engine($, on, 70, COMPACTED)
  await $.session.start(START)

  await compactOnce($, clock)
  await compactOnce($, clock)
  const refused = await compactOnce($, clock)
  expect(refused.deny).toMatch(/already compacted 2 times through this tool, its limit/)
  expect(commands).toHaveLength(2)
  expect(prompts).toHaveLength(2)

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const after = await compactOnce($, clock)
  expect(after.result).toMatch(/^Compaction scheduled/)
  expect(commands).toHaveLength(3)
})

test('a vetoed compaction does not count toward the limit', async ($, on) => {
  const clock = mock.clock(on, {})
  engine($, on, 70, { skip: 'blocked by a PreCompact hook' })
  await $.session.start(START)
  for (const _ of [1, 2, 3]) await compactOnce($, clock)
  expect((await compactOnce($, clock)).result).toMatch(/^Compaction scheduled/)
})
