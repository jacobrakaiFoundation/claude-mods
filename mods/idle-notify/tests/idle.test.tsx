import { expect, mock, test } from 'claude-code/testing'
import type { AudioClip, On, UiNotifyResult } from 'claude-code'

const SECOND = 1000
const TURN = { turnId: 't1', durationMs: 1000, isAborted: false, answer: 'done', reason: 'answer' } as const
const PROMPT = { text: 'next', wait: false, origin: { kind: 'composer' } } as const
const QUESTION = {
  tool: 'AskUserQuestion' as const,
  questions: [
    {
      question: 'Which database?',
      header: 'Database',
      options: [
        { label: 'Postgres', description: 'relational' },
        { label: 'SQLite', description: 'embedded' },
      ],
      multiSelect: false,
    },
  ],
}

const SENT: UiNotifyResult = { isSent: true, channel: 'iterm2' }

/** Stands for the engine beneath the plugin: a notifier answering `notifyAnswer`, a player, and a question dialog the test answers. */
const engine = (on: On, notifyAnswer: UiNotifyResult) => {
  const clock = mock.clock(on)
  const notified: { text: string; title?: string }[] = []
  const played: AudioClip[] = []
  let answer: () => void = () => {
    throw new Error('no question is open')
  }
  on('ui.notify', (_, e) => {
    notified.push(e)
    return { value: notifyAnswer }
  })
  on('audio.play', (_, e) => {
    played.push(e.clip)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await new Promise<void>(resolve => (answer = resolve))
    return { result: { questions: [], answers: { 'Which database?': 'Postgres' } } }
  })
  return { clock, notified, played, answer: () => answer() }
}

test('a finished turn notifies after the default 60 seconds, without a chime', async ($, on) => {
  const { clock, notified, played } = engine(on, SENT)
  await $.turn.complete(TURN)

  await clock.advance(59 * SECOND)
  expect(notified).toEqual([])
  await clock.advance(SECOND)
  expect(notified).toEqual([{ text: 'Claude is waiting for your input', title: 'Claude Code' }])
  expect(played).toEqual([])

  await clock.advance(600 * SECOND)
  expect(notified.length).toBe(1)
})

test('a prompt sent before the delay cancels it', { options: { delaySeconds: 15, sound: true } }, async ($, on) => {
  const { clock, notified, played } = engine(on, SENT)
  await $.turn.complete(TURN)
  await clock.advance(10 * SECOND)
  await $.prompt.submit(PROMPT)
  await clock.advance(60 * SECOND)
  expect(notified).toEqual([])

  await $.turn.complete({ ...TURN, turnId: 't2' })
  await clock.advance(15 * SECOND)
  expect(notified.length).toBe(1)
  expect(played).toEqual([{ asset: 'sounds/chime.wav' }])
})

test('an interrupted turn and a subagent finishing start no wait', async ($, on) => {
  const { clock, notified } = engine(on, SENT)
  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })
  await $.turn.complete({ ...TURN, turnId: 'a1', agentId: 'agent-1' })
  await clock.advance(120 * SECOND)
  expect(notified).toEqual([])
})

test('an open question notifies after the delay; one answered in time does not', async ($, on) => {
  const { clock, notified, answer } = engine(on, SENT)

  const asked = $.tool.call(QUESTION)
  await clock.advance(60 * SECOND)
  expect(notified).toEqual([{ text: 'Claude asked you a question', title: 'Claude Code' }])
  answer()
  await asked

  const again = $.tool.call(QUESTION)
  await clock.advance(30 * SECOND)
  answer()
  await again
  await clock.advance(120 * SECOND)
  expect(notified.length).toBe(1)
})

test('with notifications disabled no chime plays', { options: { delaySeconds: 15, sound: true } }, async ($, on) => {
  const { clock, notified, played } = engine(on, { isSent: false, reason: 'disabled' })
  await $.turn.complete(TURN)
  await clock.advance(15 * SECOND)
  expect(notified.length).toBe(1)
  expect(played).toEqual([])
})

test('a main-loop turn start and a /clear cancel the wait; a subagent turn start does not', async ($, on) => {
  const { clock, notified } = engine(on, SENT)
  await $.turn.complete(TURN)
  await $.turn.start({ text: 'look around', turnId: 'a1', agentId: 'agent-1' })
  await clock.advance(60 * SECOND)
  expect(notified.length).toBe(1)

  await $.turn.complete({ ...TURN, turnId: 't2' })
  await $.turn.start({ text: 'next', turnId: 't3' })
  await clock.advance(120 * SECOND)
  expect(notified.length).toBe(1)

  await $.turn.complete({ ...TURN, turnId: 't4' })
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  await clock.advance(120 * SECOND)
  expect(notified.length).toBe(1)
})
