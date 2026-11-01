import { expect, mock, test } from 'claude-code/testing'
import type { CommandRunResult, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const RUN = { command: 'queue', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } } as const
const TURN = { turnId: 't1', durationMs: 1000, isAborted: false, answer: 'done' } as const

/** Runs "/queue <args>" as typed at the prompt. */
const queue = ($: Engine, args: string): Promise<CommandRunResult> => $.command.run({ ...RUN, args })

/** Stands for the engine beneath the plugin, recording what it submits and pins. */
const engine = (on: On) => {
  const clock = mock.clock(on)
  const submitted: string[] = []
  const statuses: (string | undefined)[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  const logs: string[] = []
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { clock, submitted, statuses, logs }
}

test('prompts queued mid-turn run one per finished turn', async ($, on) => {
  const { clock, submitted, statuses } = engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })

  expect((await queue($, 'second')).text).toBe('Queued #1: second')
  expect((await queue($, ' third ')).text).toBe('Queued #2: third')
  expect(statuses.at(-1)).toBe('queued: 2')
  expect((await queue($, '')).text).toBe('2 queued:\n1. second\n2. third')
  expect(submitted).toEqual([])

  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['second'])
  expect(statuses.at(-1)).toBe('queued: 1')

  await $.turn.start({ text: 'second', turnId: 't2' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['second', 'third'])
  expect(statuses.at(-1)).toBeUndefined()
})

test('an interrupted turn or a subagent finishing leaves the queue waiting', async ($, on) => {
  const { clock, submitted } = engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'next')

  await $.turn.complete({ ...TURN, turnId: 'a1', agentId: 'agent-1', reason: 'answer' })
  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })
  await clock.settle()
  expect(submitted).toEqual([])
  expect((await queue($, '')).text).toBe('1 queued:\n1. next')
})

test('a prompt queued while idle is submitted at once', async ($, on) => {
  const { clock, submitted, logs } = engine(on)
  await $.session.start(START)
  expect((await queue($, 'go')).text).toBe('Submitting: go')
  await clock.settle()
  expect(logs).toEqual([])
  expect(submitted).toEqual(['go'])
})

test('/queue clear empties the queue and the status line', async ($, on) => {
  const { clock, submitted, statuses } = engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'a')
  await queue($, 'b')

  expect((await queue($, 'clear')).text).toBe('Cleared 2 queued prompts.')
  expect(statuses.at(-1)).toBeUndefined()
  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual([])
})

test('a slash command is refused, not queued', async ($, on) => {
  const { clock, submitted } = engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  expect((await queue($, '/commit')).text).toBe(
    'Not queued: /commit\nA plugin cannot submit a slash command as your prompt; run it yourself when the turn ends.',
  )
  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual([])
})

test('queued while idle behind a waiting prompt, the reply names the one submitted', async ($, on) => {
  const { clock, submitted } = engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'A')
  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })

  expect((await queue($, 'C')).text).toBe('Submitting: A\nQueued #1: C')
  await clock.settle()
  expect(submitted).toEqual(['A'])
})

test('a dropped prompt goes back to the head of the queue', async ($, on) => {
  const clock = mock.clock(on)
  const attempts: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    attempts.push(e.text)
    return attempts.length === 1 ? { drop: 'blocked by a guard' } : { text: e.text }
  })
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'A')
  await queue($, 'B')

  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.settle()
  expect((await queue($, '')).text).toBe('2 queued:\n1. A\n2. B')

  await $.turn.start({ text: 'other', turnId: 't2' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(attempts).toEqual(['A', 'A'])
  expect((await queue($, '')).text).toBe('1 queued:\n1. B')
})

test('while a submitted prompt has not started, no other is submitted', async ($, on) => {
  const clock = mock.clock(on)
  const submitted: string[] = []
  let startPending = (): void => {}
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return new Promise(resolve => {
      startPending = () => resolve({ text: e.text })
    })
  })
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'A')
  await queue($, 'B')

  await $.turn.complete({ ...TURN, reason: 'answer' })
  await $.turn.start({ text: 'typed', turnId: 't2' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['A'])

  startPending()
  await clock.settle()
  await $.turn.start({ text: 'A', turnId: 't3' })
  await $.turn.complete({ ...TURN, turnId: 't3', reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['A', 'B'])
})

test('a reload while a submitted prompt has not started does not stall the queue', async ($, on) => {
  const clock = mock.clock(on)
  const submitted: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    // The reload drops the plugin's await of this submit: it never settles here.
    return e.text === 'A' ? new Promise(() => {}) : { text: e.text }
  })
  await $.session.start(START)
  await $.turn.start({ text: 'first', turnId: 't1' })
  await queue($, 'A')
  await queue($, 'B')
  await $.turn.complete({ ...TURN, reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['A'])

  await $.session.start(START)
  await $.turn.start({ text: 'A', turnId: 't2' })
  await $.turn.complete({ ...TURN, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(submitted).toEqual(['A', 'B'])
})
