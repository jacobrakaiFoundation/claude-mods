import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptSubmitInput, TurnStepInput } from 'claude-code'

/**
 * Stands for the engine beneath the plugin, recording what reached it. A prompt submitted
 * while idle starts its turn inside `prompt.submit`, as a session does; one submitted over a
 * running turn (`turnId` set) is only queued.
 */
const engine = ($: Engine, on: On) => {
  const seen = { texts: [] as string[], efforts: [] as TurnStepInput['effort'][], toasts: [] as string[], logs: [] as string[] }
  let turns = 0
  on('prompt.submit', async (_, e) => {
    seen.texts.push(e.text)
    if (e.turnId === undefined) await $.turn.start({ text: e.text, turnId: `idle${++turns}` })
    return { text: e.text }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    seen.efforts.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    seen.logs.push(e.text)
    return { value: undefined }
  })
  return seen
}

const PROMPT: PromptSubmitInput = { text: '', wait: false, origin: { kind: 'composer' } }

/** Sends one model request of a turn and ends it, as the session does after the turn started. */
const finishTurn = async ($: Engine, turnId: string) => {
  const step = $.turn.step({ turnId, index: 0, model: 'opus', effort: 'medium', messageCount: 1 })
  for await (const _ of step);
  await $.turn.complete({ turnId, answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
}

/** Submits a prompt while idle and runs the turn it starts. */
const runPrompt = async ($: Engine, text: string, turnId: string) => {
  await $.prompt.submit({ ...PROMPT, text })
  await finishTurn($, turnId)
}

test('a leading or trailing token sets that turn alone and leaves the prompt', async ($, on) => {
  const seen = engine($, on)

  await runPrompt($, '!high refactor the parser', 'idle1')
  await runPrompt($, 'rename foo to bar !LOW', 'idle2')
  await runPrompt($, 'what does !max mean', 'idle3')

  expect(seen.texts).toEqual(['refactor the parser', 'rename foo to bar', 'what does !max mean'])
  expect(seen.efforts).toEqual(['high', 'low', 'medium'])
  expect(seen.toasts).toEqual(['effort high for this turn', 'effort low for this turn'])
})

test('a keyword rule routes by the prompt start; a token beats it', { options: { rules: ['deep  Dive => max', 'quick => low'] } }, async ($, on) => {
  const seen = engine($, on)

  await runPrompt($, 'Quick: what is 2+2', 'idle1')
  await runPrompt($, 'quickly explain monads', 'idle2')
  await runPrompt($, 'quick check !xhigh', 'idle3')
  await runPrompt($, 'deep dive  into the cache', 'idle4')

  expect(seen.efforts).toEqual(['low', 'medium', 'xhigh', 'max'])
})

test('a prompt queued over a running turn binds only to the turn that starts with its text', async ($, on) => {
  const seen = engine($, on)

  await $.turn.start({ text: 'first', turnId: 't0' })
  await $.prompt.submit({ ...PROMPT, text: '!max A', turnId: 't0' })
  await $.prompt.submit({ ...PROMPT, text: 'B', turnId: 't0' })
  await $.prompt.submit({ ...PROMPT, text: '!low delivered into t0', turnId: 't0' })
  await finishTurn($, 't0')
  // A notification turn, then the queued prompts' own turns.
  await $.turn.start({ text: '<task-notification>done</task-notification>', turnId: 't1' })
  await finishTurn($, 't1')
  await $.turn.start({ text: 'A', turnId: 't2' })
  await finishTurn($, 't2')
  await $.turn.start({ text: 'B', turnId: 't3' })
  await finishTurn($, 't3')

  expect(seen.efforts).toEqual(['medium', 'medium', 'max', 'medium'])
})

test('a token alone is refused, beside an image it is kept, and a peer message is left as is', async ($, on) => {
  const seen = engine($, on)

  expect(await $.prompt.submit({ ...PROMPT, text: '!high' })).toEqual({
    drop: 'effort-router: !high needs a prompt beside it',
  })
  await $.prompt.submit({ ...PROMPT, text: '!high', attachments: [{ type: 'image', mediaType: 'image/png' }] })
  await finishTurn($, 'idle1')
  await $.prompt.submit({ ...PROMPT, text: '!low from a peer', origin: { kind: 'peer' } })
  await finishTurn($, 'idle2')

  expect(seen.texts).toEqual(['', '!low from a peer'])
  expect(seen.efforts).toEqual(['high', 'medium'])
})

test('a broken rule is reported once in the transcript and tokens still work', { options: { rules: ['quick -> low'] } }, async ($, on) => {
  const seen = engine($, on)

  await runPrompt($, '!high go', 'idle1')
  await runPrompt($, 'quick go', 'idle2')

  expect(seen.logs).toEqual([
    'effort-router: rule 1 "quick -> low" must read "phrase => level", level one of low, medium, high, xhigh, max; keyword rules are off until it is fixed in /config',
  ])
  expect(seen.efforts).toEqual(['high', 'medium'])
})
