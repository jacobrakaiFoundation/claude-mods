import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionAppendInput } from 'claude-code'

/** 2026-11-01 14:05:09 local time. */
const AT = new Date(2026, 10, 1, 14, 5, 9).getTime()

const PROMPT_UUID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const REPLY_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const OLD_UUID = '16fd2706-8baf-433b-82eb-8c7fada847da'
const QUEUED_UUID = '9b2e4c1a-3f5d-4e7a-8c9b-0d1e2f3a4b5c'

const PROMPT: SessionAppendInput = {
  message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'check worker status' }] },
  door: 'prompt',
  origin: { kind: 'composer' },
  uuid: PROMPT_UUID,
}

const REPLY: SessionAppendInput = {
  message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Both workers are active.' }] },
  door: 'response',
  origin: { kind: 'model', model: 'claude-opus-5-5' },
  uuid: REPLY_UUID,
}

const userRow = (requestId: string) =>
  ({
    plugin: 'timestamps',
    component: 'UserMessage',
    requestId,
    props: { text: 'check worker status', origin: { kind: 'composer' }, isExpanded: false },
  }) as const

const replyRow = (requestId: string) =>
  ({
    plugin: 'timestamps',
    component: 'AssistantMessage',
    requestId,
    props: { text: 'Both workers are active.', isFirstOfReply: true },
  }) as const

/** Stands for the engine's own message row. */
const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

test('a prompt and its reply each show the time they were appended', async ($, on) => {
  const clock = mock.clock(on, { now: AT })
  engine(on)
  await $.session.append(PROMPT)
  await clock.advance(2_000)
  await $.session.append(REPLY)

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [row, time] of [
      [userRow(PROMPT_UUID), '14:05:09'],
      [replyRow(REPLY_UUID), '14:05:11'],
    ] as const) {
      const ui = await $.ui.mount({ ...row, surface })
      expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine row')
      expect((await ui.find({ type: 'Text', text: /^\d/ }))?.text).toBe(time)
      await ui.unmount()
    }
  }
})

test('a block drawn from a row of several finds the row by its uuid prefix', async ($, on) => {
  mock.clock(on, { now: AT })
  engine(on)
  await $.session.append(REPLY)
  // The engine's id for block 1 of the row: the uuid's first 24 characters, then the index.
  const blockId = `${REPLY_UUID.slice(0, 24)}000000000001`
  const ui = await $.ui.mount({ ...replyRow(blockId), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^\d/ }))?.text).toBe('14:05:09')
  await ui.unmount()
})

test('a prompt folded into the running turn shows the time it was appended', async ($, on) => {
  mock.clock(on, { now: AT })
  engine(on)
  await $.session.append({
    message: { type: 'attachment', name: 'queued_command', role: 'user', content: [{ type: 'text', text: 'also check logs' }] },
    door: 'attachment',
    origin: { kind: 'composer' },
    uuid: QUEUED_UUID,
  })
  const ui = await $.ui.mount({ ...userRow(QUEUED_UUID), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^\d/ }))?.text).toBe('14:05:09')
  await ui.unmount()
})

test('12-hour times when the clock option says so', { options: { clock: '12h' } }, async ($, on) => {
  mock.clock(on, { now: AT })
  engine(on)
  await $.session.append(PROMPT)
  const ui = await $.ui.mount({ ...userRow(PROMPT_UUID), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^\d/ }))?.text).toBe('2:05:09 PM')
  await ui.unmount()
})

test('a message from before the mod loaded is the engine row alone', async ($, on) => {
  mock.clock(on, { now: AT })
  engine(on)
  await $.session.append(PROMPT)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...userRow(OLD_UUID), surface })
    expect(await ui.drawn()).toMatchObject({ type: 'Text' })
    expect(await ui.find({ type: 'Text', text: /^\d/ })).toBeUndefined()
    await ui.unmount()
  }
})
