import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'

/** How long the buddy stays awake after the last turn ends or the session starts. */
const SLEEPY_MS = 10 * 60_000

const SPECIES = ['cat', 'owl', 'duck', 'ghost', 'blob'] as const
type Species = (typeof SPECIES)[number]

/** What is drawn: the stored mood, or `thinking` while a turn runs. */
type Shown = Mood | 'thinking'

/**
 * Each species' rows, `{l}` and `{r}` its eyes and `{m}` its mouth; the middle row is its face.
 * ASCII only, so every glyph takes one cell on every terminal.
 */
const ART: Record<Species, readonly [string, string, string]> = {
  cat: [' /\\_/\\ ', '( {l}{m}{r} )', ' > ^ < '],
  owl: [' ,___, ', ' ({l}{m}{r}) ', ' /)__) '],
  duck: ['   __   ', '__({l})>  ', '\\___)   '],
  ghost: [' .-. ', '({l}{m}{r})', "'~~~'"],
  blob: ['  ___  ', ' ({l}{m}{r}) ', '(_____)'],
}

const FACES: Record<Shown, { l: string; m: string; r: string }> = {
  idle: { l: 'o', m: '.', r: 'o' },
  thinking: { l: 'o', m: '?', r: 'o' },
  happy: { l: '^', m: 'w', r: '^' },
  worried: { l: 'O', m: '_', r: 'O' },
  sleepy: { l: '-', m: '.', r: '-' },
}

const PHRASES: Record<Shown, string> = {
  idle: 'is keeping you company',
  thinking: 'is thinking…',
  happy: 'is pleased',
  worried: 'is worried',
  sleepy: 'is napping  z z z',
}

const PHRASE_COLORS: Record<Shown, 'subtle' | 'suggestion' | 'success' | 'warning'> = {
  idle: 'subtle',
  thinking: 'suggestion',
  happy: 'success',
  worried: 'warning',
  sleepy: 'subtle',
}

const isSpecies = (value: unknown): value is Species => SPECIES.some(species => species === value)

/** Pure: the creature's rows for a mood, the face row alone when fewer than all fit. */
export const artRows = (species: Species, shown: Shown, maxRows: number): string[] => {
  const face = FACES[shown]
  const rows = ART[species].map(row => row.replace('{l}', face.l).replace('{m}', face.m).replace('{r}', face.r))
  return rows.length <= maxRows ? rows : rows.slice(1, 2)
}

/** Pure: a worry outlasts the turn's spinner; otherwise a running turn means thinking. */
export const shownMood = (mood: Mood, isWorking: boolean): Shown =>
  isWorking && mood !== 'worried' ? 'thinking' : mood

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')

/** Starts the countdown after which the buddy falls asleep; a refused write is logged, not dropped. */
const napTimer = ($: EngineInterface): Timer =>
  $.clock.after(SLEEPY_MS, () => {
    update($, mood, () => 'sleepy').catch((error: unknown) => {
      $.ui.log(
        JSON.stringify({ plugin: 'buddy', event: 'nap', failed: 'state write', error: String(error) }),
        { to: 'debug' },
      )
    })
  })

export const register: Register = (on, options) => {
  const name = options.name
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(`buddy: option "name" must be a non-empty string, got ${JSON.stringify(name)}`)
  }
  const species = options.species
  if (!isSpecies(species)) {
    throw new Error(`buddy: option "species" must be one of ${SPECIES.join(', ')}, got ${JSON.stringify(species)}`)
  }

  let nap: Timer | undefined

  on('session.start', async ($, e, next) => {
    await update($, mood, () => 'idle')
    nap?.cancel()
    nap = napTimer($)
    return next(e)
  })

  // A new turn wakes the buddy and forgets the last turn's worry.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      nap?.cancel()
      await update($, mood, () => 'idle')
    }
    return next(e)
  })

  // Any errored result of the main loop's calls: a refused permission or a non-zero exit counts.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (result.isError === true && e.agentId === undefined) await update($, mood, () => 'worried')
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const ended: Mood = e.reason === 'answer' ? 'happy' : e.reason === 'aborted' ? 'idle' : 'worried'
      // A tool error in an answered turn keeps the buddy worried until the next turn.
      await update($, mood, current => (ended === 'happy' && current === 'worried' ? 'worried' : ended))
      nap?.cancel()
      nap = napTimer($)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const shown = shownMood(await read($, mood), e.props.isWorking)
    const rows = artRows(species, shown, e.props.maxRows)
    const artWidth = Math.max(...rows.map(row => row.length))
    if (e.props.bodyColumns < artWidth) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Box flexDirection="column" flexShrink={0}>
          {rows.map(row => (
            <Text color="claude" mono wrap="truncate-end">
              {row}
            </Text>
          ))}
        </Box>
        <Text wrap="truncate-end">
          <Text weight="semibold">{name}</Text>
          <Text color={PHRASE_COLORS[shown]}>{` ${PHRASES[shown]}`}</Text>
        </Text>
      </Box>
    )
  })
}
