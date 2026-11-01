import { expect, test } from 'claude-code/testing'
import type { On, ToolGroupCall } from 'claude-code'

const call = (tool: string, input: Record<string, string>, isErrored = false): ToolGroupCall => ({
  tool,
  input,
  isRunning: false,
  isErrored,
  isInterrupted: false,
})

const group = (calls: ToolGroupCall[], isExpanded: boolean) =>
  ({
    plugin: 'tool-group-names',
    component: 'ToolGroup',
    requestId: 'toolu_1',
    props: { calls, isActive: false, isExpanded },
  }) as const

/** Stands for the engine's own folded count line. */
const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine count line</Text>
  })

test('a folded group keeps the engine line and names what it read and searched', async ($, on) => {
  engine(on)
  const calls = [
    call('Read', { file_path: '/repo/hooks/register.tsx' }),
    call('Read', { file_path: 'C:\\repo\\README.md' }),
    call('Read', { file_path: '/repo/.env' }, true),
    call('Grep', { pattern: 'TODO', path: '/repo' }),
    call('Glob', { pattern: '**/*.ts' }),
    call('Bash', { command: 'ls' }),
  ]
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...group(calls, false), surface })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine count line')
    expect((await ui.find({ type: 'Text', text: /⎿/ }))?.text).toBe(
      '  ⎿  register.tsx, README.md, .env ✗, "TODO", +1',
    )
    await ui.unmount()
  }
})

test('files that share a name are told apart by their folder', async ($, on) => {
  engine(on)
  const calls = [
    call('Read', { file_path: '/t/ClaudePinchZoom/README.md' }),
    call('Read', { file_path: '/t/ClaudeEnterKey/README.md' }),
    call('Read', { file_path: '/t/ClaudeEnterKey/LICENSE' }),
  ]
  const ui = await $.ui.mount({ ...group(calls, false), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /⎿/ }))?.text).toBe(
    '  ⎿  ClaudePinchZoom/README.md, ClaudeEnterKey/README.md, LICENSE',
  )
  await ui.unmount()
})

test('an expanded group, or one that names nothing, is the engine line alone', async ($, on) => {
  engine(on)
  for (const props of [group([call('Read', { file_path: '/a.ts' })], true), group([call('Bash', { command: 'ls' })], false)]) {
    const ui = await $.ui.mount({ ...props, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /⎿/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine count line')
    await ui.unmount()
  }
})
