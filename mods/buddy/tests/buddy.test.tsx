import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'buddy',
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

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const ANSWERED = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

/** Stands for the engine beneath the plugin: these events answer as a session would. */
const engine = (on: On) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && e.command === 'false' ? { isError: true, result: 'exit 1', text: 'exit 1' } : { result: {} },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('the buddy idles, thinks while a turn runs and is pleased when it lands', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    let ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^\( o\.o \)$/ }))?.text).toBe('( o.o )')
    expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is keeping you company')
    await ui.unmount()

    ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, isWorking: true } })
    expect((await ui.find({ type: 'Text', text: /^\( o\?o \)$/ }))?.text).toBe('( o?o )')
    expect((await ui.find({ type: 'Text', text: /^Pip$/ }))?.text).toBe('Pip')
    await ui.unmount()
  }

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(ANSWERED)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is pleased')
  await ui.unmount()
})

test('a tool error worries the buddy until the next turn starts', async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'false' })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: true } })
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is worried')
  await ui.unmount()

  await $.turn.complete(ANSWERED)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^\( O_O \)$/ }))?.text).toBe('( O_O )')
  await ui.unmount()

  await $.turn.start({ text: 'again', turnId: 't2' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is keeping you company')
  await ui.unmount()
})

test('left alone the buddy falls asleep', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(ANSWERED)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(9 * 60_000)
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is pleased')
  await clock.advance(60_000)
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is napping  z z z')
  expect((await ui.find({ type: 'Text', text: /^\( -\.- \)$/ }))?.text).toBe('( -.- )')
  await ui.unmount()
})

test('the buddy yields to a survey and to a band too narrow for it', async ($, on) => {
  engine(on)
  for (const props of [
    { ...BAND.props, hasSurvey: true },
    { ...BAND.props, bodyColumns: 5 },
  ]) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    await ui.unmount()
  }
})

test('a short band shows the face alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 1 } })
  expect(await ui.find({ type: 'Text', text: /\/\\_\/\\/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^\( o\.o \)$/ }))?.text).toBe('( o.o )')
  await ui.unmount()
})

test('the name and species come from the config', { options: { name: 'Hoot', species: 'owl' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^ \(o\.o\) $/ }))?.text).toBe(' (o.o) ')
  expect((await ui.find({ type: 'Text', text: /^Hoot$/ }))?.text).toBe('Hoot')
  await ui.unmount()
})

test("a subagent's tool error does not worry the buddy", async ($, on) => {
  mock.clock(on, { now: 0 })
  engine(on)
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'false', agentId: 'a1' })
  await $.turn.complete(ANSWERED)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^ is/ }))?.text).toBe(' is pleased')
  await ui.unmount()
})
