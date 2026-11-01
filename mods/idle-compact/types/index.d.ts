declare module 'claude-code' {
  interface PluginState {
    'idle-compact': {
      /** True from the main loop's `turn.start` until its `turn.complete`. */
      isTurnRunning: boolean
      /** `$.clock.now()` at the main loop's last `turn.complete`, its last model response; null before the first. */
      lastTurnEndedAt: number | null
    }
  }
}
