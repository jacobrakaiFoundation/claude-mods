import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ALL_ON = { read: true, grep: true, glob: true, edit: true, write: true, enforceInBypass: false }

const ALL_TOOLS = ['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write']

/** Stands for the engine beneath the plugin: it has `tools`, and every tool call that reaches it runs. */
const engine = (on: On, tools: readonly string[]) => {
  const ran: string[] = []
  on('tool.list', () => ({ value: tools.map(name => ({ name, description: name, mcp: false })) }))
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash') ran.push(e.command)
    return { result: {} }
  })
  return ran
}

test('a lone cat is turned back with the tool to use', { options: ALL_ON }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  const answer = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts' })
  expect(answer.deny).toMatch(/^Use the Read tool instead of `cat`/)
  expect(ran).toEqual([])
})

test('a command doing real work runs', { options: ALL_ON }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  const answer = await $.tool.call({ tool: 'Bash', command: 'grep -rn TODO src | wc -l' })
  expect(answer.deny).toBeUndefined()
  expect(ran).toEqual(['grep -rn TODO src | wc -l'])
})

test('a rule switched off lets its commands run', { options: { ...ALL_ON, grep: false } }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  await $.tool.call({ tool: 'Bash', command: 'grep -rn TODO src' })
  const read = await $.tool.call({ tool: 'Bash', command: 'head -n 5 README.md' })
  expect(ran).toEqual(['grep -rn TODO src'])
  expect(read.deny).toMatch(/Read tool/)
})

test('a command is left to Bash when the session lacks the tool it would point to', { options: ALL_ON }, async ($, on) => {
  const ran = engine(on, ['Bash', 'Read', 'Edit', 'Write'])
  const answer = await $.tool.call({ tool: 'Bash', command: 'grep -rn TODO src' })
  expect(answer.deny).toBeUndefined()
  expect(ran).toEqual(['grep -rn TODO src'])
})

test('a subagent\'s commands run, since its own tools are not known', { options: ALL_ON }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  const answer = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts', agentId: 'a1' })
  expect(answer.deny).toBeUndefined()
  expect(ran).toEqual(['cat src/index.ts'])
})

test('bypass-permissions mode lets commands run until the mode changes', { options: ALL_ON }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'bypassPermissions' })
  const inBypass = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts' })
  await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 't1',
    permission_mode: 'default',
  })
  const afterSwitch = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts' })
  expect(inBypass.deny).toBeUndefined()
  expect(afterSwitch.deny).toMatch(/Read tool/)
  expect(ran).toEqual(['cat src/index.ts'])
})

test('a subagent\'s mode does not change the main loop\'s', { options: ALL_ON }, async ($, on) => {
  engine(on, ALL_TOOLS)
  await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 't1',
    permission_mode: 'bypassPermissions',
    agent_id: 'a1',
  })
  const answer = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts' })
  expect(answer.deny).toMatch(/Read tool/)
})

test('enforceInBypass keeps the rules on in bypass-permissions mode', { options: { ...ALL_ON, enforceInBypass: true } }, async ($, on) => {
  const ran = engine(on, ALL_TOOLS)
  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'bypassPermissions' })
  const answer = await $.tool.call({ tool: 'Bash', command: 'cat src/index.ts' })
  expect(answer.deny).toMatch(/Read tool/)
  expect(ran).toEqual([])
})
