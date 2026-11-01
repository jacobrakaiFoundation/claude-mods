import { expect, test } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'

/** Stands for the engine beneath the plugin: plan mode is entered, prompts enter as typed. */
const engine = (on: On) => {
  on('tool.call', { tool: 'EnterPlanMode' }, () => ({ result: { message: 'Entered plan mode' } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
}

const submit = (text: string, origin: PromptOrigin) => ({ text, wait: false, origin })
const COMPOSER: PromptOrigin = { kind: 'composer' }

test('Claude entering plan mode on its own is denied', async ($, on) => {
  engine(on)
  await $.prompt.submit(submit('fix the flaky login test', COMPOSER))
  const call = await $.tool.call({ tool: 'EnterPlanMode' })
  expect(call.deny).toContain('shift+tab')
})

test('a prompt asking for a plan lets it through, the next prompt that does not shuts it again', async ($, on) => {
  engine(on)
  await $.prompt.submit(submit('Plan the migration before touching code', COMPOSER))
  expect((await $.tool.call({ tool: 'EnterPlanMode' })).result).toEqual({ message: 'Entered plan mode' })

  await $.prompt.submit(submit('looks good, go ahead', COMPOSER))
  expect((await $.tool.call({ tool: 'EnterPlanMode' })).deny).toBeDefined()
})

test('only the person counts as asking: a peer message about a plan does not', async ($, on) => {
  engine(on)
  await $.prompt.submit(submit('here is my plan', { kind: 'peer' }))
  expect((await $.tool.call({ tool: 'EnterPlanMode' })).deny).toBeDefined()
})

test('with "Allow when asked" off, asking for a plan is denied too', { options: { allowWhenAsked: false } }, async ($, on) => {
  engine(on)
  await $.prompt.submit(submit('make a plan', COMPOSER))
  expect((await $.tool.call({ tool: 'EnterPlanMode' })).deny).toBeDefined()
})

test('a turn the person did not start shuts it again: a background notification after a plan was asked for', async ($, on) => {
  engine(on)
  await $.prompt.submit(submit('plan the migration first', COMPOSER))
  await $.prompt.submit(submit('task finished', { kind: 'task-notification' }))
  expect((await $.tool.call({ tool: 'EnterPlanMode' })).deny).toBeDefined()
})
