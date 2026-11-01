import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const MINUTE = 60_000
const TURN = { turnId: 't1', durationMs: 1000, isAborted: false, answer: 'done', reason: 'answer' } as const
const PROMPT = { text: 'next', wait: false, origin: { kind: 'composer' } } as const

const COMMAND = { text: '/context', command: { name: 'context', args: '' }, wait: false, origin: { kind: 'composer' } } as const
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

/** Stands for the engine's turns, log and prompt box beneath the plugin, recording log lines; `draft.text` is the box. */
const base = (on: On) => {
  const clock = mock.clock(on)
  const logs: string[] = []
  const draft = { text: '' }
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: draft.text, cursor: draft.text.length } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return { clock, logs, draft }
}

const usageAt = (on: On, contextPercent: number | undefined): void => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: contextPercent === undefined ? { window: 200_000 } : { window: 200_000, percent: contextPercent },
      rateLimits: [],
    },
  }))
}

/**
 * Stands for the engine beneath the plugin, at a fixed context fill, recording compactions; a submitted
 * prompt starts its turn before `prompt.submit` resolves, and a slash command (`/context`) starts none.
 */
const engine = ($: Engine, on: On, contextPercent: number) => {
  const { clock, logs, draft } = base(on)
  const compactions: string[] = []
  usageAt(on, contextPercent)
  on('session.compact', (_, e) => {
    compactions.push(e.instructions ?? 'compacted')
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('prompt.submit', async (_, e) => {
    if (e.command === undefined) await $.turn.start({ text: e.text, turnId: 't2' })
    return { text: e.text }
  })
  return { clock, compactions, logs, draft }
}

test('a full context is compacted once after 55 idle minutes', async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.turn.complete(TURN)

  await clock.advance(54 * MINUTE)
  expect(compactions).toEqual([])
  await clock.advance(MINUTE)
  expect(compactions).toEqual(['compacted'])
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual(['compacted'])
})

test('a prompt or a new turn restarts the wait', async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(50 * MINUTE)
  await $.prompt.submit(PROMPT)
  await clock.advance(60 * MINUTE)
  expect(compactions).toEqual([])

  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.advance(54 * MINUTE)
  expect(compactions).toEqual([])
  await clock.advance(MINUTE)
  expect(compactions).toEqual(['compacted'])
})

test('a subagent finishing while the main turn runs starts no wait', async ($, on) => {
  const { clock, compactions } = engine($, on, 90)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.turn.complete({ ...TURN, turnId: 'a1', agentId: 'agent-1' })
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual([])
})

test('the configured wait and threshold apply', { options: { idleMinutes: 4, minContextPercent: 70 } }, async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(4 * MINUTE)
  expect(compactions).toEqual([])
})

test('a context above the configured threshold compacts after the configured wait', { options: { idleMinutes: 4, minContextPercent: 50 } }, async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(4 * MINUTE)
  expect(compactions).toEqual(['compacted'])
})

test('a load before any response starts no wait', async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.session.start(START)
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual([])
})

test('a reload waits only the rest of the time since the last response', async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(50 * MINUTE)
  await $.session.start(START)
  await clock.advance(4 * MINUTE)
  expect(compactions).toEqual([])
  await clock.advance(MINUTE)
  expect(compactions).toEqual(['compacted'])
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual(['compacted'])
})

test('a local slash command after a turn leaves the wait running to the same end', async ($, on) => {
  const { clock, compactions } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(10 * MINUTE)
  await $.prompt.submit(COMMAND)
  await clock.advance(44 * MINUTE)
  expect(compactions).toEqual([])
  await clock.advance(MINUTE)
  expect(compactions).toEqual(['compacted'])
})

test('once the time since the last response has passed, nothing compacts', async ($, on) => {
  const { clock, logs } = base(on)
  const compactions: string[] = []
  let percent: number | undefined = undefined
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: percent === undefined ? { window: 200_000 } : { window: 200_000, percent },
      rateLimits: [],
    },
  }))
  on('session.compact', () => {
    compactions.push('compacted')
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.turn.complete(TURN)
  await clock.advance(60 * MINUTE)
  percent = 62
  await $.prompt.submit(COMMAND)
  await $.session.start(START)
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual([])
  expect(logs.at(-1)).toBe(
    'idle-compact: not compacting, 55 min have passed since the last response and the prompt cache is likely cold',
  )
})

test('a prompt being typed when the wait ends is not compacted away', async ($, on) => {
  const { clock, compactions, logs, draft } = engine($, on, 62)
  await $.turn.complete(TURN)
  await clock.advance(50 * MINUTE)
  draft.text = 'half a'
  await clock.advance(5 * MINUTE)
  expect(compactions).toEqual([])
  expect(logs).toEqual(['idle-compact: not compacting, a prompt is being typed'])
  await clock.advance(120 * MINUTE)
  expect(compactions).toEqual([])
})

test('a prompt that is dropped before its turn leaves the wait running', async ($, on) => {
  const { clock, logs } = base(on)
  const compactions: string[] = []
  usageAt(on, 62)
  on('session.compact', () => {
    compactions.push('compacted')
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('prompt.submit', () => ({ drop: 'blocked by a guard' }))
  await $.turn.complete(TURN)
  await clock.advance(50 * MINUTE)
  await $.prompt.submit(PROMPT)
  await clock.advance(4 * MINUTE)
  expect(compactions).toEqual([])
  await clock.advance(MINUTE)
  expect(compactions).toEqual(['compacted'])
  expect(logs).toHaveLength(1)
})

test('an unknown context fill, a skipped or a failed compaction is logged', async ($, on) => {
  const { clock, logs } = base(on)
  let percent: number | undefined = undefined
  let compaction: 'skip' | 'fail' = 'skip'
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: percent === undefined ? { window: 200_000 } : { window: 200_000, percent },
      rateLimits: [],
    },
  }))
  on('session.compact', () => {
    // A throwing hook beneath leaves the compaction unanswered, so the plugin's call rejects.
    if (compaction === 'fail') throw new Error('compaction API returned 529')
    return { skip: 'nothing to compact' }
  })

  await $.turn.complete(TURN)
  await clock.advance(55 * MINUTE)
  expect(logs).toEqual(['idle-compact: not compacting, the context fill is not known yet (it is after the next response)'])

  percent = 62
  await $.turn.complete(TURN)
  await clock.advance(55 * MINUTE)
  expect(logs.at(-1)).toBe('idle-compact: compaction skipped: nothing to compact')

  compaction = 'fail'
  await $.turn.complete(TURN)
  await clock.advance(55 * MINUTE)
  expect(logs.at(-1)).toContain('idle-compact: compacting after 55 idle min failed: HooksError')
})
