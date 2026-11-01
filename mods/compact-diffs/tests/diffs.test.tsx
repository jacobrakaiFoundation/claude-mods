import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { parseResult, shownPath, summaryLine } from '../hooks/register'

const EDIT = {
  filePath: '/repo/src/foo.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: 'a\n',
  structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: [' x', '-a', '+b', '+c', '+d'] }],
  userModified: false,
  replaceAll: false,
}

const WRITE = {
  type: 'create',
  filePath: '/repo/README.md',
  content: '# t\n\nbody\n',
  structuredPatch: [],
  originalFile: null,
}

const result = (tool: string, output: unknown, isErrored: boolean, isExpanded: boolean | undefined) =>
  ({
    plugin: 'compact-diffs',
    component: 'ToolResult',
    requestId: 'toolu_1',
    props: { tool_use_id: 'toolu_1', tool, output, isErrored, isExpanded },
  }) as const

/** Stands for the engine beneath the plugin: the session's directory and the tool's own diff block. */
const engine = (on: On) => {
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine diff</Text>
  })
}

test('a folded Edit or Write result is one dim line', async ($, on) => {
  engine(on)
  const cases = [
    { props: result('Edit', EDIT, false, false), surface: 'terminal', line: '  ⎿  Edited src/foo.ts (+3 -1)' },
    { props: result('Write', WRITE, false, false), surface: 'desktop', line: 'Wrote README.md (3 lines)' },
  ] as const
  for (const { props, surface, line } of cases) {
    const ui = await $.ui.mount({ ...props, surface })
    const drawn = await ui.find({ type: 'Text', text: /Edited|Wrote/ })
    expect(drawn?.text).toBe(line)
    expect(drawn?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('expanded views, errors and surfaces that do not report expansion keep the engine diff', async ($, on) => {
  engine(on)
  const kept = [
    result('Edit', EDIT, false, true),
    result('Write', 'File has not been read yet', true, false),
    result('Edit', EDIT, false, undefined),
  ]
  for (const props of kept) {
    const ui = await $.ui.mount({ ...props, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine diff')
    await ui.unmount()
  }
})

test('a root cwd keeps absolute paths; an overwrite without a patch says so', () => {
  expect(shownPath('/etc/hosts', '/')).toBe('/etc/hosts')
  const overwrite = parseResult('Write', { ...WRITE, type: 'update', originalFile: null })
  expect(summaryLine('Write', overwrite, 'README.md')).toBe('Wrote README.md (3 lines, no diff)')
})
