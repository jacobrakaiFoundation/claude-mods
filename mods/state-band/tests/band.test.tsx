import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'state-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

const WORKING = { ...BAND.props, isWorking: true }
const NOW = Date.parse('2026-11-01T10:05:00Z')
const TURN = { answer: 'ok', durationMs: 64_000, isAborted: false, turnId: 't1' } as const

/** The wall-clock time the band should print for NOW, in the zone the test runs in. */
const hhmm = (ms: number) => {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Stands for the engine beneath the plugin: these events answer as a session would; `running` is a tool call's run. */
const engine = (on: On, running: () => Promise<void>) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  on('tool.call', async () => {
    await running()
    return { result: {} }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const wordOf = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<{ text: string } | undefined> }) =>
  (await ui.find({ type: 'Text', text: /^. [a-z]+$/ }))?.text

test('idle, then working, then done with the time and duration', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, async () => {})

  for (const surface of ['terminal', 'desktop'] as const) {
    let ui = await $.ui.mount({ ...BAND, surface })
    expect(await wordOf(ui)).toBe('○ idle')
    await ui.unmount()

    ui = await $.ui.mount({ ...BAND, surface, props: WORKING })
    expect(await wordOf(ui)).toBe('● working')
    expect((await ui.find({ type: 'Text', text: /^● working$/ }))?.props.color).toBe('claude')
    await ui.unmount()
  }

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ ...TURN, reason: 'answer' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await wordOf(ui)).toBe('✓ done')
  expect((await ui.find({ type: 'Text', text: /took/ }))?.text).toBe(`${hhmm(NOW)} · took 1m 4s`)
  await ui.unmount()
})

test('an interrupted or failed turn reads as such', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, async () => {})

  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await wordOf(ui)).toBe('✗ interrupted')
  await ui.unmount()

  await $.turn.complete({ ...TURN, reason: 'error' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await wordOf(ui)).toBe('✗ error')
  expect((await ui.find({ type: 'Text', text: /^✗ error$/ }))?.props.color).toBe('error')
  await ui.unmount()

  // A subagent's turn ending says nothing of the main one.
  await $.turn.complete({ ...TURN, reason: 'answer', agentId: 'a1' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await wordOf(ui)).toBe('✗ error')
  await ui.unmount()
})

test('a permission dialog shows as waiting until its call settles', async ($, on) => {
  // As in a session: the dialog shows inside the call, then the approved tool runs.
  let reach = () => {}
  let finish = () => {}
  const reached = new Promise<void>(resolve => (reach = resolve))
  const finished = new Promise<void>(resolve => (finish = resolve))
  engine(on, () => {
    reach()
    return finished
  })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const call = $.tool.call({ tool: 'Bash', command: 'npm test' })
  await reached
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' } })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: WORKING })
  expect(await wordOf(ui)).toBe('? waiting')
  expect((await ui.find({ type: 'Text', text: /permission/ }))?.text).toBe('Bash needs your permission')
  await ui.unmount()

  finish()
  await call
  ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: WORKING })
  expect(await wordOf(ui)).toBe('● working')
  await ui.unmount()
})

test('a question shows as waiting while the person answers it', async ($, on) => {
  // The question is on screen once the call reaches the engine, until the person answers.
  let shown = () => {}
  let answer = () => {}
  const isShown = new Promise<void>(resolve => (shown = resolve))
  const answered = new Promise<void>(resolve => (answer = resolve))
  engine(on, () => {
    shown()
    return answered
  })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const call = $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question: 'Which?', header: 'Pick', options: [{ label: 'A', description: 'a' }], multiSelect: false }],
  })
  await isShown
  // The question's own ask raises PermissionRequest as its dialog shows.
  await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: {} })

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: WORKING })
  expect(await wordOf(ui)).toBe('? waiting')
  expect((await ui.find({ type: 'Text', text: /question/ }))?.text).toBe('Claude asked you a question')
  await ui.unmount()

  answer()
  await call
  ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: WORKING })
  expect(await wordOf(ui)).toBe('● working')
  await ui.unmount()
})

test('the band yields to a survey, and /clear forgets the last turn', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, async () => {})
  await $.turn.complete({ ...TURN, reason: 'answer' })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await wordOf(ui)).toBe('○ idle')
  await ui.unmount()
})
