import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__session-namer__rename_session'
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
/** A `claude -p` run: nobody at a prompt, nothing drawing. */
const HEADLESS = { cwd: '/', surface: null, isInteractive: false } as const
const USAGE = { input_tokens: 40, output_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
/** The person typing `text` at the prompt. */
const typed = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as const
const rename = (args: string, origin: { kind: 'composer' } | { kind: 'plugin'; name: string }) =>
  ({ command: 'rename', args, origin, presentation: { isFullscreen: false, columns: 80 } }) as const
const answerTurn = (turnId: string) =>
  ({ answer: 'The redirect now keeps the query string.', durationMs: 900, isAborted: false, turnId, reason: 'answer' }) as const

type TitleReply = string | { status: number | null; error: 'overloaded' | 'model_not_found' }

/**
 * Stands for the engine beneath the plugin, drawing on `surfaces`; returns the tools registered,
 * the `/rename` arguments it ran and the titles it was asked for. A title reply that is not a
 * string (or is missing) is an API error.
 */
const engine = (on: On, titleReplies: ReadonlyArray<TitleReply>, surfaces: ReadonlyArray<'terminal' | 'desktop'>) => {
  const registered: string[] = []
  const renames: string[] = []
  const titleAsks: string[] = []
  const roster = [...surfaces]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => {
    roster.push(e.surface === 'desktop' ? 'desktop' : 'terminal')
    return { clientId: e.clientId }
  })
  on('session.surfaces', () => ({ value: [...roster] }))
  on('tool.register', (_, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('classic.SessionStart', () => ({}))
  on('command.run', (_, e) => {
    renames.push(e.args)
    return { text: `Session renamed to: ${e.args}` }
  })
  on('model.complete', (_, e) => {
    titleAsks.push(e.prompt)
    const reply = titleReplies[titleAsks.length - 1] ?? { status: 529, error: 'overloaded' }
    return typeof reply === 'string'
      ? { value: { isAnswered: true, text: reply, usage: USAGE } }
      : { value: { isAnswered: false, reason: 'api-error', ...reply, usage: USAGE } }
  })
  return { registered, renames, titleAsks }
}

test('rename_session renames the session once the turn ends', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames, titleAsks } = engine(on, [], ['terminal'])
  await $.session.start(START)

  const called = await $.tool.call({ tool: TOOL, name: '  #42   fix auth bug ' })
  expect(called.result).toBe('The session will be renamed to "#42 fix auth bug" when this turn ends.')
  expect(renames).toEqual([])

  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(renames).toEqual(['#42 fix auth bug'])
  // A named session is not titled again.
  expect(titleAsks).toEqual([])
})

test('rename_session refuses an empty name', async ($, on) => {
  const { renames } = engine(on, [], ['terminal'])
  await $.session.start(START)
  const called = await $.tool.call({ tool: TOOL, name: '   ' })
  expect(called.deny).toBe('rename_session: "name" is empty.')
  await $.turn.complete(answerTurn('t1'))
  expect(renames).toEqual([])
})

test('an unnamed session is titled once, after its first answer', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames, titleAsks } = engine(on, ['"Fix login redirect."'], ['terminal'])
  await $.session.start(START)
  // A slash command run before the first prompt is not the request the title describes.
  await $.prompt.submit({ ...typed('/color red'), command: { name: 'color', args: 'red' } })
  await $.prompt.submit(typed('fix the login redirect'))

  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(1)
  expect(titleAsks[0]).toContain('fix the login redirect')
  expect(titleAsks[0]).not.toContain('/color')
  expect(renames).toEqual(['Fix login redirect'])

  await $.turn.complete(answerTurn('t2'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(1)
})

test('an overloaded title model is retried after a wait, then the session is left unnamed', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const overloaded = { status: 529, error: 'overloaded' } as const
  const { renames, titleAsks } = engine(on, [overloaded, overloaded, overloaded], ['terminal'])
  await $.session.start(START)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(1)
  await clock.advance(1_000)
  expect(titleAsks.length).toBe(2)
  await clock.advance(2_000)
  expect(titleAsks.length).toBe(3)
  await clock.advance(10_000)
  expect(titleAsks.length).toBe(3)
  expect(renames).toEqual([])
})

test('a title model that does not exist is asked once', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames, titleAsks } = engine(on, [{ status: 404, error: 'model_not_found' }, 'Never asked'], ['terminal'])
  await $.session.start(START)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10_000)
  expect(titleAsks.length).toBe(1)
  expect(renames).toEqual([])
})

test('a session named at start or by the person is never titled', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { titleAsks } = engine(on, ['Some title'], ['terminal'])
  await $.classic.SessionStart({ source: 'resume', session_title: 'billing refactor' })
  await $.session.start(START)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(titleAsks).toEqual([])
})

test('a /rename typed before the first answer stands; another plugin\'s does not', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames, titleAsks } = engine(on, ['Login redirect fix'], ['terminal'])
  await $.session.start(START)
  await $.command.run(rename('[api]', { kind: 'plugin', name: 'session-style' }))
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(renames).toEqual(['[api]', 'Login redirect fix'])

  await $.classic.SessionStart({ source: 'clear', session_title: 'Login redirect fix' })
  await $.command.run(rename('my own name', { kind: 'composer' }))
  await $.prompt.submit(typed('now the signup form'))
  await $.turn.complete(answerTurn('t2'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(1)
})

test('/clear keeps a name it carries over; an unnamed new conversation is titled afresh', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames, titleAsks } = engine(on, ['Signup form validation'], ['terminal'])
  await $.session.start(START)
  await $.command.run(rename('my own name', { kind: 'composer' }))
  await $.classic.SessionStart({ source: 'clear', session_title: 'my own name' })
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(titleAsks).toEqual([])
  // The name carried over is still the person's.
  const called = await $.tool.call({ tool: TOOL, name: 'Login redirect' })
  expect(called.deny).toContain('the user named this session')

  await $.classic.SessionStart({ source: 'clear' })
  await $.prompt.submit(typed('validate the signup form'))
  await $.turn.complete(answerTurn('t2'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(1)
  expect(titleAsks[0]).toContain('validate the signup form')
  expect(renames).toEqual(['my own name', 'Signup form validation'])
})

test('/resume of an unnamed session titles it from its own prompt, not the previous one', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { titleAsks } = engine(on, [{ status: 404, error: 'model_not_found' }, 'Signup form validation'], ['terminal'])
  await $.session.start(START)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)

  await $.classic.SessionStart({ source: 'resume' })
  await $.prompt.submit(typed('validate the signup form'))
  await $.turn.complete(answerTurn('t2'))
  await clock.advance(10)
  expect(titleAsks.length).toBe(2)
  expect(titleAsks[1]).toContain('validate the signup form')
  expect(titleAsks[1]).not.toContain('fix the login redirect')
})

test('rename_session keeps a name the person set unless they ask for another', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { renames } = engine(on, [], ['terminal'])
  await $.session.start(START)
  await $.command.run(rename('billing refactor', { kind: 'composer' }))
  await $.prompt.submit(typed('now fix the login redirect'))
  const refused = await $.tool.call({ tool: TOOL, name: 'Login redirect' })
  expect(refused.deny).toBe(
    'rename_session: the user named this session and did not ask to rename it in their current request; ' +
      'the name stays. Rename it only when the user asks.',
  )
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(renames).toEqual(['billing refactor'])

  await $.prompt.submit(typed('rename this session after the issue'))
  const called = await $.tool.call({ tool: TOOL, name: '#42 login redirect' })
  expect(called.result).toBe('The session will be renamed to "#42 login redirect" when this turn ends.')
  await $.turn.complete(answerTurn('t2'))
  await clock.advance(10)
  expect(renames).toEqual(['billing refactor', '#42 login redirect'])
})

test('a headless run offers no tool and is not titled; an app attaching later gets the tool', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { registered, renames, titleAsks } = engine(on, ['Some title'], [])
  await $.session.start(HEADLESS)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(registered).toEqual([])
  expect(titleAsks).toEqual([])
  expect(renames).toEqual([])

  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(registered).toEqual(['rename_session'])
})

test('auto-naming can be switched off', { options: { autoName: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { titleAsks } = engine(on, ['Some title'], ['terminal'])
  await $.session.start(START)
  await $.prompt.submit(typed('fix the login redirect'))
  await $.turn.complete(answerTurn('t1'))
  await clock.advance(10)
  expect(titleAsks).toEqual([])
})
