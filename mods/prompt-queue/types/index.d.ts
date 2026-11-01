declare module 'claude-code' {
  interface PluginState {
    'prompt-queue': {
      /** Prompts waiting to be submitted, oldest first. */
      prompts: string[]
      /** True from the main loop's `turn.start` until its `turn.complete`. */
      isTurnRunning: boolean
      /** True from taking a prompt off the queue until its `$.prompt.submit` settles (its turn started or it was refused), or until the plugin loads again. */
      isSubmitPending: boolean
    }
  }
}
