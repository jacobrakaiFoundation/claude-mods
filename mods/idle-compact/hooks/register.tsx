import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

// Kept by the host so a reload (a /config change of either option) still knows a turn is running.
const isTurnRunning = atom({ plugin: 'idle-compact', key: 'isTurnRunning' } as const, false)
// Kept by the host too, so a reload counts the wait from the last response, not from the reload.
const lastTurnEndedAt = atom({ plugin: 'idle-compact', key: 'lastTurnEndedAt' } as const, null)

type Settings = { idleMinutes: number; minContextPercent: number }

/** Reads and checks the two options; a value out of range fails the load. */
const settingsOf = (options: PluginOptions): Settings => {
  const { idleMinutes, minContextPercent } = options
  if (typeof idleMinutes !== 'number' || !Number.isFinite(idleMinutes) || idleMinutes <= 0) {
    throw new Error(`idle-compact: option "idleMinutes" must be a number above 0, got ${JSON.stringify(idleMinutes)}`)
  }
  if (
    typeof minContextPercent !== 'number' ||
    !Number.isFinite(minContextPercent) ||
    minContextPercent < 0 ||
    minContextPercent > 100
  ) {
    throw new Error(
      `idle-compact: option "minContextPercent" must be a number from 0 to 100, got ${JSON.stringify(minContextPercent)}`,
    )
  }
  return { idleMinutes, minContextPercent }
}

/** Compacts when the context is full enough that rebuilding its cache would cost more than the summary. */
const compactIfFull = async ($: EngineInterface, settings: Settings): Promise<void> => {
  const { context } = await $.session.usage()
  if (context.percent === undefined) {
    $.ui.log('idle-compact: not compacting, the context fill is not known yet (it is after the next response)', {
      to: 'debug',
    })
    return
  }
  if (context.percent < settings.minContextPercent) {
    $.ui.log(
      `idle-compact: not compacting, context at ${context.percent}% is under the ${settings.minContextPercent}% threshold`,
      { to: 'debug' },
    )
    return
  }
  $.ui.log(`idle-compact: idle for ${settings.idleMinutes} min at ${context.percent}% context, compacting before the prompt cache expires`)
  const compacted = await $.session.compact()
  if (compacted.skip !== undefined) $.ui.log(`idle-compact: compaction skipped: ${compacted.skip}`)
}

/** Compacts a full context unless a turn started after the wait was set or a prompt is being typed. */
const compactIfIdle = async ($: EngineInterface, settings: Settings): Promise<void> => {
  if (await read($, isTurnRunning)) {
    $.ui.log('idle-compact: not compacting, a turn started as the wait ended', { to: 'debug' })
    return
  }
  const draft = await $.prompt.read()
  if (draft.text !== '') {
    $.ui.log('idle-compact: not compacting, a prompt is being typed', { to: 'debug' })
    return
  }
  await compactIfFull($, settings)
}

/**
 * Starts the wait for the time left of `idleMinutes` since the main loop's last response, or none
 * while its turn runs, before its first response, or once that time has passed (the cache is likely cold).
 */
const startWaiting = async ($: EngineInterface, settings: Settings): Promise<Timer | undefined> => {
  if (await read($, isTurnRunning)) return undefined
  const endedAt = await read($, lastTurnEndedAt)
  if (endedAt === null) return undefined
  const remainingMs = endedAt + settings.idleMinutes * 60_000 - (await $.clock.now())
  if (remainingMs <= 0) {
    $.ui.log(
      `idle-compact: not compacting, ${settings.idleMinutes} min have passed since the last response and the prompt cache is likely cold`,
      { to: 'debug' },
    )
    return undefined
  }
  return $.clock.after(remainingMs, () => {
    compactIfIdle($, settings).catch((error: unknown) => {
      $.ui.log(`idle-compact: compacting after ${settings.idleMinutes} idle min failed: ${String(error)}`)
    })
  })
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)
  let idle: Timer | undefined

  const stopWaiting = (): void => {
    idle?.cancel()
    idle = undefined
  }

  // A reload (a /config change of either option drops the old timer) waits out the rest of the time.
  on('session.start', async ($, e, next) => {
    stopWaiting()
    idle = await startWaiting($, settings)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    stopWaiting()
    const result = await next(e)
    // A prompt dropped, or a local command (/context, /cost) that asked no model, starts no turn:
    // the session is idle again, so wait out the rest of the time. A started turn makes this a no-op.
    stopWaiting()
    idle = await startWaiting($, settings)
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isTurnRunning, () => true)
      stopWaiting()
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await update($, isTurnRunning, () => false)
    const endedAt = await $.clock.now()
    await update($, lastTurnEndedAt, () => endedAt)
    stopWaiting()
    idle = await startWaiting($, settings)
    return result
  })

  // `/clear` and exit end the conversation the timer was waiting on.
  on('session.end', async ($, e, next) => {
    stopWaiting()
    return next(e)
  })
}
