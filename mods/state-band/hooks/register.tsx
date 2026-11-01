import { atom, read, update } from 'claude-code'
import type { Register, ThemeKey } from 'claude-code'

import type { Outcome, Waiting } from '../types'

const outcome = atom({ plugin: 'state-band', key: 'outcome' } as const, null)
const waiting = atom({ plugin: 'state-band', key: 'waiting' } as const, null)

/** The one line the band draws: a mark, a word, and what follows it. */
type Marker = { mark: string; word: string; detail: string; color: ThemeKey }

/** "4s", "1m 4s" or "1h 2m". */
export const durationText = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/** The local wall-clock time of `ms` as "HH:MM". */
export const clockText = (ms: number): string => {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const ERROR_WORDS: Record<Extract<Outcome, { kind: 'error' }>['reason'], string> = {
  aborted: 'interrupted',
  error: 'error',
  refusal: 'refused',
}

/** Pure: waiting on the person outranks a running turn, which outranks how the last one ended. */
export const marker = (state: { waiting: Waiting | null; isWorking: boolean; outcome: Outcome | null }): Marker => {
  if (state.waiting?.kind === 'question') {
    return { mark: '?', word: 'waiting', detail: 'Claude asked you a question', color: 'suggestion' }
  }
  if (state.waiting?.kind === 'permission') {
    return { mark: '?', word: 'waiting', detail: `${state.waiting.tool} needs your permission`, color: 'permission' }
  }
  if (state.isWorking) return { mark: '●', word: 'working', detail: '', color: 'claude' }
  if (state.outcome === null) return { mark: '○', word: 'idle', detail: '', color: 'subtle' }
  if (state.outcome.kind === 'done') {
    const { at, durationMs } = state.outcome
    return { mark: '✓', word: 'done', detail: `${clockText(at)} · took ${durationText(durationMs)}`, color: 'success' }
  }
  return { mark: '✗', word: ERROR_WORDS[state.outcome.reason], detail: clockText(state.outcome.at), color: 'error' }
}

export const register: Register = on => {
  // AskUserQuestion's call runs while the person answers. A permission dialog shows inside
  // the call's next(e) and no event marks the person's answer, so its waiting state lasts
  // until that call settles: for an approved tool, until the tool has finished.
  on('tool.call', async ($, e, next) => {
    const isQuestion = e.tool === 'AskUserQuestion'
    const clearPermission = (current: Waiting | null) =>
      current?.kind === 'permission' && current.tool === e.tool ? null : current
    await update($, waiting, (current): Waiting | null => (isQuestion ? { kind: 'question' } : clearPermission(current)))
    try {
      return await next(e)
    } finally {
      await update($, waiting, current => (isQuestion && current?.kind === 'question' ? null : clearPermission(current)))
    }
  })

  // Raised as the dialog is about to show; a hook beneath that decided means no dialog.
  // AskUserQuestion's ask raises it too, and its dialog is the question itself.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined && e.tool_name !== 'AskUserQuestion') {
      await update($, waiting, (): Waiting => ({ kind: 'permission', tool: e.tool_name }))
    }
    return result
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await update($, waiting, () => null)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, waiting, () => null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      const ended: Outcome =
        e.reason === 'answer' ? { kind: 'done', at, durationMs: e.durationMs } : { kind: 'error', at, reason: e.reason }
      await update($, outcome, () => ended)
      await update($, waiting, () => null)
    }
    return next(e)
  })

  // `/clear` ends the conversation: its last turn's state goes with it.
  on('session.end', async ($, e, next) => {
    await update($, outcome, () => null)
    await update($, waiting, () => null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const line = marker({
      waiting: await read($, waiting),
      isWorking: e.props.isWorking,
      outcome: await read($, outcome),
    })
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={2}>
        <Text color={line.color} weight="semibold" wrap="truncate-end">
          {`${line.mark} ${line.word}`}
        </Text>
        {line.detail === '' ? null : (
          <Text color="subtle" tabular wrap="truncate-end">
            {line.detail}
          </Text>
        )}
      </Box>
    )
  })
}
