/** What the buddy last felt; `thinking` is drawn from the band's own `isWorking`. */
export type Mood = 'idle' | 'happy' | 'worried' | 'sleepy'

declare module 'claude-code' {
  interface PluginState {
    buddy: {
      mood: Mood
    }
  }
}
