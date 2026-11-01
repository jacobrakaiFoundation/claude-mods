import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const FILE = '/repo/.claude/session-style.json'
/** A `/rename` the person types at the prompt. */
const typedRename = (args: string) =>
  ({ command: 'rename', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const

/**
 * Stands for the engine beneath the plugin: a repository at /repo whose style file holds `file`,
 * or none, and a session rooted at `root`.
 */
const engine = (on: On, file: string | null, root: string) => {
  const ran: string[] = []
  const logs: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  on('session.root', () => ({ value: root }))
  on('fs.exists', (_, e) => ({ value: (file !== null && e.path === FILE) || e.path === '/repo/.git' }))
  on('fs.read', (_, e) => {
    if (file === null || e.path !== FILE) throw new Error(`no file at ${e.path}`)
    return { value: file }
  })
  on('command.run', (_, e) => {
    ran.push(`/${e.command} ${e.args}`)
    return { text: 'done' }
  })
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { ran, logs }
}

test("the project's file sets the color and leads every name with its prefix", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, '{ "color": "green", "namePrefix": "[api]", "note": "ignored" }', '/repo')
  await $.classic.SessionStart({ source: 'startup' })
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual(['/color green', '/rename [api]'])

  await $.command.run(typedRename('fix login redirect'))
  await $.command.run(typedRename('[api] already led'))
  expect(ran.slice(2)).toEqual(['/rename [api] fix login redirect', '/rename [api] already led'])
})

test('a resumed session keeps its name, led by the prefix', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, '{ "namePrefix": "[api]" }', '/repo')
  await $.classic.SessionStart({ source: 'resume', session_title: 'billing refactor' })
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual(['/rename [api] billing refactor'])
})

test('an invalid file is reported and nothing is applied', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran, logs } = engine(on, '{ "color": "teal" }', '/repo')
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual([])
  expect(logs).toEqual([
    `session-style: ${FILE}: "color" must be one of red, blue, green, yellow, purple, orange, pink, cyan, got "teal"`,
  ])

  await $.command.run(typedRename('plain'))
  expect(ran).toEqual(['/rename plain'])
})

test('without a project file the configured defaults apply', { options: { color: 'blue' } }, async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, null, '/repo')
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual(['/color blue'])
})

test('a session started in a subfolder finds the file at the repository top', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, '{ "color": "green" }', '/repo/packages/api')
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual(['/color green'])
})

test('a reload does not style the session again over a later name', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, '{ "color": "pink", "namePrefix": "web" }', '/repo')
  await $.session.start(START)
  await clock.settle()
  await $.command.run(typedRename('my work'))
  await $.session.start(START)
  await clock.settle()
  expect(ran).toEqual(['/color pink', '/rename web', '/rename web my work'])
})

test('/clear styles the new conversation, keeping the name it carried over', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const { ran } = engine(on, '{ "color": "pink", "namePrefix": "web" }', '/repo')
  await $.session.start(START)
  await clock.settle()
  await $.command.run(typedRename('my work'))
  // Raised in the new conversation, whose state the engine starts empty.
  await $.classic.SessionStart({ source: 'clear', session_title: 'web my work' })
  await clock.advance(10)
  await $.command.run(typedRename('next task'))
  expect(ran).toEqual(['/color pink', '/rename web', '/rename web my work', '/color pink', '/rename web next task'])
})
