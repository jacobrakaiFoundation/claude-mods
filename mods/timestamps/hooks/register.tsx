import type { Register } from 'claude-code'

import type { TimestampsClock } from '../types'

const CLOCKS: ReadonlyArray<TimestampsClock> = ['24h', '12h']

const isClock = (value: unknown): value is TimestampsClock => CLOCKS.some(clock => clock === value)

/**
 * The key a row's time is kept under: the first 24 characters of its uuid.
 *
 * The transcript draws a stored row of several blocks as one row per block,
 * each with an id that keeps those 24 characters of the row's uuid and ends
 * in the block's index, so a drawn block finds the time of the row it came
 * from; a one-block row is drawn under its uuid unchanged.
 */
export const rowKey = (id: string): string => id.slice(0, 24)

const twoDigits = (n: number): string => String(n).padStart(2, '0')

/** Pure: `ms` as local wall-clock time, "14:05:09" or "2:05:09 PM". */
export const formatTime = (ms: number, clock: TimestampsClock): string => {
  const date = new Date(ms)
  const hours = date.getHours()
  const rest = `${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`
  if (clock === '24h') return `${twoDigits(hours)}:${rest}`
  return `${hours % 12 === 0 ? 12 : hours % 12}:${rest} ${hours < 12 ? 'AM' : 'PM'}`
}

export const register: Register = (on, options) => {
  const clock = options.clock
  if (!isClock(clock)) {
    throw new Error(`timestamps: option "clock" must be one of ${CLOCKS.join(', ')}, got ${JSON.stringify(clock)}`)
  }

  // Tool results are user-role rows the transcript never draws as a message. A
  // prompt typed while Claude works and folded into the running turn is an
  // attachment row named queued_command, drawn as a prompt under its own uuid.
  on('session.append', async ($, e, next) => {
    const isQueuedPrompt = e.message.type === 'attachment' && e.message.name === 'queued_command'
    const isMessage = isQueuedPrompt || ((e.message.type === 'user' || e.message.type === 'assistant') && e.door !== 'tool-result')
    if (!isMessage) return next(e)
    const appendedAt = await $.clock.now()
    const stored = await next(e)
    if (stored.uuid === undefined) return stored
    await $.state.set({ plugin: 'timestamps', key: 'appendedAt', id: rowKey(stored.uuid) }, appendedAt)
    return stored
  })

  on('ui.render', { component: ['UserMessage', 'AssistantMessage'] }, async ($, e, next) => {
    // Rows from before the mod was loaded, and a reply still streaming, have no time.
    const { value: appendedAt } = await $.state.get({ plugin: 'timestamps', key: 'appendedAt', id: rowKey(e.requestId) })
    const engine = await next(e)
    if (appendedAt === undefined) return engine

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="flex-end" columnGap={1}>
        <Box flexGrow={1} flexShrink={1}>
          {engine}
        </Box>
        <Box flexShrink={0}>
          <Text dimColor>{formatTime(appendedAt, clock)}</Text>
        </Box>
      </Box>
    )
  })
}
