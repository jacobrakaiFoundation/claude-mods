import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BLOCKED = { options: { skills: ['claude-api', '/commit-commands:clean_gone'] } }

const LISTING = [
  'The following skills are available for use with the Skill tool:',
  '',
  '- claude-api: Reference for the Claude API.',
  'TRIGGER - read BEFORE opening the target file.',
  '- commit-commands:clean_gone: Cleans up gone branches.',
  '- commit-commands:commit: Creates a git commit.',
  '- verify: Cross-check a claim.',
].join('\n')

/** Stands for the engine beneath the plugin: each event answers as core would. */
const engine = (on: On, ran: string[]) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.invalidate', (_, e) => {
    ran.push(`invalidate ${e.event}`)
    return { value: undefined }
  })
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  on('command.describe', (_, e) => ({ description: e.description, isHidden: e.isHidden }))
  on('tool.call', (_, e) => {
    ran.push(String(e.tool))
    return { result: 'loaded' }
  })
  on('skill.prompt', (_, e) => ({ text: `body of ${e.skill}` }))
}

test('blocked skills drop out of the listing, wrapped descriptions included', BLOCKED, async ($, on) => {
  engine(on, [])
  const { text } = await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
  expect(text).toBe(
    [
      'The following skills are available for use with the Skill tool:',
      '',
      '- commit-commands:commit: Creates a git commit.',
      '- verify: Cross-check a claim.',
    ].join('\n'),
  )
})

test('a bulleted description line is neither an entry nor a leak', { options: { skills: ['claude-api'] } }, async ($, on) => {
  engine(on, [])
  const listing = ['- claude-api: Ref.', 'Triggers:', '- SKIP when OpenAI: is named', '- verify', '- other: o'].join('\n')
  const { text } = await $.prompt.attachment({ type: 'skill_listing', text: listing, origin: { kind: 'engine' } })
  expect(text).toBe(['- verify', '- other: o'].join('\n'))
})

test('a load asks the engine again for the listing and the typeahead', BLOCKED, async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(ran).toEqual(['invalidate prompt.attachment', 'invalidate command.describe'])
})

test('the Skill tool refuses a blocked skill and runs the rest', BLOCKED, async ($, on) => {
  const ran: string[] = []
  engine(on, ran)
  const refused = await $.tool.call({ tool: 'Skill', skill: 'commit-commands:clean_gone' })
  expect(refused.deny).toBe('skill-blocklist: the skill "commit-commands:clean_gone" is disabled.')
  expect(ran).toEqual([])

  await $.tool.call({ tool: 'Skill', skill: 'commit-commands:commit' })
  expect(ran).toEqual(['Skill'])
})

test('a blocked skill typed as /name loads a notice and is hidden from the typeahead', BLOCKED, async ($, on) => {
  engine(on, [])
  expect((await $.skill.prompt({ skill: 'claude-api', text: 'x' })).text).toContain('"claude-api" is disabled')
  expect((await $.skill.prompt({ skill: 'verify', text: 'x' })).text).toBe('body of verify')
  // A subagent's preload names a plugin's skill bare.
  const preload = { skill: 'clean_gone', pluginName: 'commit-commands', source: 'plugin', text: 'x' } as const
  expect((await $.skill.prompt(preload)).text).toContain('"clean_gone" is disabled')
  expect((await $.skill.prompt({ ...preload, skill: 'commit' })).text).toBe('body of commit')

  const row = { description: 'd', isHidden: false, immediate: false, provider: { plugin: 'user', tier: 'user' } } as const
  expect((await $.command.describe({ ...row, command: 'claude-api' })).isHidden).toBe(true)
  expect((await $.command.describe({ ...row, command: 'verify' })).isHidden).toBe(false)
})

test('with no skills configured nothing changes', async ($, on) => {
  engine(on, [])
  const { text } = await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
  expect(text).toBe(LISTING)
})
