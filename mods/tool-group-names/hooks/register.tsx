import type { Register, ToolGroupCall } from 'claude-code'

/** Names shown before the rest are counted as "+N". */
const MAX_NAMES = 4

const stringField = (input: unknown, field: string): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[field]
  return typeof value === 'string' && value !== '' ? value : undefined
}

const segments = (path: string): string[] => path.split(/[\\/]/).filter(Boolean)

/** The last `count` segments of a path, joined with "/". */
const tail = (path: string, count: number): string => segments(path).slice(-count).join('/') || path

/** What one folded call touched: a file path, or a search's pattern; undefined for anything else. */
type Touched = { kind: 'file'; path: string } | { kind: 'pattern'; text: string } | { kind: 'dir'; path: string }

const touched = (call: ToolGroupCall): Touched | undefined => {
  const path = stringField(call.input, 'file_path') ?? stringField(call.input, 'notebook_path')
  if (path !== undefined) return { kind: 'file', path }
  const pattern = stringField(call.input, 'pattern')
  if (pattern !== undefined) return { kind: 'pattern', text: call.tool === 'Grep' ? `"${pattern}"` : pattern }
  const dir = stringField(call.input, 'path')
  return dir === undefined ? undefined : { kind: 'dir', path: dir }
}

/**
 * Pure: the line listing what the calls touched, blocked or failed ones marked, or undefined
 * when none name anything. Files are named by their base name, with the parent folder added
 * where two files in the group share one (ClaudePinchZoom/README.md, ClaudeEnterKey/README.md).
 */
export const namesLine = (calls: ReadonlyArray<ToolGroupCall>): string | undefined => {
  const items = calls.flatMap(call => {
    const t = touched(call)
    return t === undefined ? [] : [{ t, isErrored: call.isErrored }]
  })
  const fileBases = items.flatMap(({ t }) => (t.kind === 'file' ? [tail(t.path, 1)] : []))
  const isShared = (base: string) => fileBases.filter(b => b === base).length > 1
  const names = items.map(({ t, isErrored }) => {
    const name =
      t.kind === 'pattern' ? t.text
      : t.kind === 'dir' ? `${tail(t.path, 1)}/`
      : isShared(tail(t.path, 1)) ? tail(t.path, 2)
      : tail(t.path, 1)
    return isErrored ? `${name} ✗` : name
  })
  if (names.length === 0) return undefined
  const shown = names.slice(0, MAX_NAMES).join(', ')
  return names.length > MAX_NAMES ? `${shown}, +${names.length - MAX_NAMES}` : shown
}

export const register: Register = on => {
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const line = e.props.isExpanded ? undefined : namesLine(e.props.calls)
    const engine = await next(e)
    if (line === undefined) return engine

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {engine}
        <Text dimColor wrap="truncate-end">
          {`  ⎿  ${line}`}
        </Text>
      </Box>
    )
  })
}
