/** A prompt bar color the built-in /color takes. */
export type SessionStyleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'cyan'

/** The look this project's sessions get; a field left out is not applied. */
export type SessionStyle = { color?: SessionStyleColor; namePrefix?: string }

declare module 'claude-code' {
  interface PluginState {
    'session-style': {
      /** The style in force, read at session start; null before then or when the project file is invalid. */
      style: SessionStyle | null
      /** The name the session started with (`claude -n`, a resume), if any. */
      startTitle: string | null
      /** The name this mod queued with /rename and that has not run yet; null once it ran or a newer rename cancelled it. */
      queuedName: string | null
      /** Whether this conversation was styled; a later session.start (a reload) styles nothing again. */
      isApplied: boolean
    }
  }
}
