/** The plugin's userConfig, as the manifest declares it. */
export type NoAutoPlanOptions = {
  /** Let Claude enter plan mode when the person's latest prompt mentions "plan". */
  allowWhenAsked: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'no-auto-plan': {
      /** Whether the person's latest prompt asked for a plan ("plan", "planning", ...). */
      askedForPlan: boolean
    }
  }
}
