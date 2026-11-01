import type { Register } from 'claude-code'

/** The built-in tools whose result block draws an inline diff. */
const DIFF_TOOLS = ['Edit', 'Write'] as const
type DiffTool = (typeof DIFF_TOOLS)[number]

/** What the line needs of an Edit or Write result (BuiltinToolResults), checked at runtime. */
type DiffResult = {
  filePath: string
  isCreate: boolean
  isStaged: boolean
  content: string | undefined
  patchLines: ReadonlyArray<string>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const invalid = (tool: DiffTool, why: string, output: unknown): Error =>
  new Error(`compact-diffs: ${tool} result ${why}; got ${JSON.stringify(output)?.slice(0, 500)}`)

/** The diff lines of every hunk in a result's `structuredPatch`. */
const patchLinesOf = (tool: DiffTool, output: Record<string, unknown>): string[] => {
  const patch = output.structuredPatch
  if (!Array.isArray(patch)) throw invalid(tool, 'has no structuredPatch array', output)
  return patch.flatMap((hunk: unknown) => {
    if (!isRecord(hunk) || !Array.isArray(hunk.lines) || !hunk.lines.every(l => typeof l === 'string')) {
      throw invalid(tool, 'has a structuredPatch hunk without string lines', output)
    }
    return hunk.lines as string[]
  })
}

/** Pure: the fields the line draws from, or an error naming what the result lacks. */
export const parseResult = (tool: DiffTool, output: unknown): DiffResult => {
  if (!isRecord(output)) throw invalid(tool, 'is not an object', output)
  if (typeof output.filePath !== 'string') throw invalid(tool, 'has no string filePath', output)
  const isStaged = output.staged === true
  const patchLines = patchLinesOf(tool, output)
  if (tool === 'Edit') return { filePath: output.filePath, isCreate: false, isStaged, content: undefined, patchLines }
  if (output.type !== 'create' && output.type !== 'update') throw invalid(tool, 'has a type other than create or update', output)
  if (typeof output.content !== 'string') throw invalid(tool, 'has no string content', output)
  return { filePath: output.filePath, isCreate: output.type === 'create', isStaged, content: output.content, patchLines }
}

/** Pure: the path as the transcript names it, relative to the session's directory when inside it. */
export const shownPath = (filePath: string, cwd: string): string => {
  const base = cwd.replace(/[\\/]+$/, '')
  // A root cwd ('/') leaves no base to strip: every absolute path keeps its leading slash.
  if (base === '') return filePath
  const isInside = filePath.startsWith(`${base}/`) || filePath.startsWith(`${base}\\`)
  return isInside ? filePath.slice(base.length + 1) : filePath
}

const lineCount = (content: string): number =>
  content === '' ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0)

/** Pure: `Edited src/foo.ts (+3 -1)`, `Wrote README.md (42 lines)`. */
export const summaryLine = (tool: DiffTool, result: DiffResult, path: string): string => {
  const added = result.patchLines.filter(l => l.startsWith('+')).length
  const removed = result.patchLines.filter(l => l.startsWith('-')).length
  const counts = `(+${added} -${removed})`
  if (tool === 'Edit') return result.isStaged ? `Staged edit to ${path} ${counts}` : `Edited ${path} ${counts}`
  // An overwrite with an empty patch (nothing changed, diff timed out, old content too large) has no counts.
  const lines = lineCount(result.content ?? '')
  const noun = lines === 1 ? 'line' : 'lines'
  const size = result.isCreate ? `(${lines} ${noun})` : result.patchLines.length === 0 ? `(${lines} ${noun}, no diff)` : counts
  return result.isStaged ? `Staged write to ${path} ${size}` : `Wrote ${path} ${size}`
}

export const register: Register = on => {
  for (const tool of DIFF_TOOLS) {
    on('ui.render', { component: 'ToolResult', props: { tool } }, async ($, e, next) => {
      // Fold only where the surface reports the view as folded, so ctrl+o / --verbose can still unfold it.
      if (e.props.isExpanded !== false || e.props.isErrored) return next(e)
      const result = parseResult(tool, e.props.output)
      const line = summaryLine(tool, result, shownPath(result.filePath, await $.session.cwd()))
      const { Text } = $.ui.resolve(e)
      return (
        <Text dimColor wrap="truncate-end">
          {e.surface === 'terminal' ? `  ⎿  ${line}` : line}
        </Text>
      )
    })
  }
}
