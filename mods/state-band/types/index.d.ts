/** How the last main-loop turn ended, and when (`$.clock.now()` milliseconds). */
export type Outcome =
  | { kind: 'done'; at: number; durationMs: number }
  | { kind: 'error'; at: number; reason: 'aborted' | 'error' | 'refusal' }

/** What a running turn waits on the person for: a question, or a tool's permission dialog. */
export type Waiting = { kind: 'question' } | { kind: 'permission'; tool: string }

declare module 'claude-code' {
  interface PluginState {
    'state-band': {
      outcome: Outcome | null
      waiting: Waiting | null
    }
  }
}
