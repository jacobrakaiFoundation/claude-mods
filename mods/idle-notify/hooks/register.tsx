import type { EngineInterface, Register, Timer, UiNotifyResult } from 'claude-code'

const TITLE = 'Claude Code'
const WAITING_TEXT = 'Claude is waiting for your input'
const QUESTION_TEXT = 'Claude asked you a question'
const CHIME = { asset: 'sounds/chime.wav' } as const

type Alerting = Pick<EngineInterface, 'clock' | 'ui' | 'audio'>

/** The delay option as milliseconds; a delay that is not a positive number fails the load. */
const delayMsOf = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`idle-notify: option "delaySeconds" must be a positive number, got ${JSON.stringify(value)}`)
  }
  return value * 1000
}

/** Sends the notification and, once it went out and when asked, the chime; says on screen what kept either from going out. */
const alert = async ($: Alerting, text: string, shouldChime: boolean): Promise<void> => {
  let sent: UiNotifyResult
  try {
    sent = await $.ui.notify(text, { title: TITLE })
  } catch (error) {
    $.ui.toast(`idle-notify: the notification failed: ${String(error)}`)
    return
  }
  if (!sent.isSent) {
    if (sent.reason === 'no-channel') {
      $.ui.toast('idle-notify: this terminal has no notification channel; set preferredNotifChannel in /config')
    }
    return
  }
  if (!shouldChime) return
  try {
    await $.audio.play(CHIME)
  } catch (error) {
    $.ui.toast(`idle-notify: the chime failed: ${String(error)}`)
  }
}

/** The notification waiting to go out; one at a time, replaced by each new wait. */
let pending: Timer | undefined

const disarm = (): void => {
  pending?.cancel()
  pending = undefined
}

/** Starts the wait: after `delayMs` with nothing typed or sent, `text` goes out. */
const arm = ($: Alerting, delayMs: number, text: string, shouldChime: boolean): void => {
  disarm()
  pending = $.clock.after(delayMs, () => {
    pending = undefined
    void alert($, text, shouldChime)
  })
}

export const register: Register = (on, options) => {
  const delayMs = delayMsOf(options.delaySeconds)
  const sound = options.sound
  if (typeof sound !== 'boolean') {
    throw new Error(`idle-notify: option "sound" must be a boolean, got ${JSON.stringify(sound)}`)
  }

  // A main-loop turn that ended on its own leaves Claude waiting; an interrupt means you are here.
  // Armed before the hooks beneath run, so typing while they finish still cancels it.
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && !e.isAborted) arm($, delayMs, WAITING_TEXT, sound)
    return next(e)
  })

  // The question dialog is open for as long as the call runs.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    arm($, delayMs, QUESTION_TEXT, sound)
    try {
      return await next(e)
    } finally {
      disarm()
    }
  })

  on('prompt.edit', ($, e, next) => {
    disarm()
    return next(e)
  })

  // Every change but another plugin's fill is the person's doing: a recall, an undo, dictation, a clear.
  on('prompt.change', ($, e, next) => {
    if (e.origin.kind !== 'plugin') disarm()
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    disarm()
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) disarm()
    return next(e)
  })

  on('session.end', ($, e, next) => {
    disarm()
    return next(e)
  })
}
