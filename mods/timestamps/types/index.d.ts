/** How times are written: 24-hour (14:05:09) or 12-hour (2:05:09 PM). */
export type TimestampsClock = '24h' | '12h'

declare module 'claude-code' {
  interface PluginState {
    timestamps: {
      /**
       * When each user or assistant row was appended, in epoch milliseconds,
       * keyed by the first 24 characters of the row's uuid (see `rowKey`).
       */
      appendedAt: StateFamily<number>
    }
  }
}
