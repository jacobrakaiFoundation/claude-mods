/** A session name as `/rename` takes it. */
export type SessionNamerTitle = string

declare module 'claude-code' {
  interface PluginState {
    'session-namer': {
      /** The name Claude asked for with rename_session, applied when its turn ends. */
      pending: SessionNamerTitle | null
      /** Whether the session has a name: given at start or resume, by /rename, or by this mod. */
      isNamed: boolean
      /** Whether the name was set by the person: `claude -n`, a resumed session's, their own /rename. */
      isPersonNamed: boolean
      /** Whether the automatic title was already tried in this conversation. */
      isAutoNameTried: boolean
      /** The person's first prompt in this conversation (no slash command, nothing hidden): what the title describes. */
      firstPrompt: string | null
      /** The person's latest prompt (no slash command, nothing hidden): whether they asked for a name. */
      lastPrompt: string | null
    }
  }
}
