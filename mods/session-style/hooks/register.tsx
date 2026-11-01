import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SessionStyle, SessionStyleColor } from '../types'

const PLUGIN = 'session-style'
/** Where a project keeps its style, under its repository's top level or the directory Claude started in. */
const STYLE_FILE = '.claude/session-style.json'
const MAX_PREFIX_CHARS = 40
/** The colors the built-in /color takes (besides `default`, which resets it). */
const COLORS: ReadonlyArray<SessionStyleColor> = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']

const style = atom({ plugin: 'session-style', key: 'style' } as const, null)
const startTitle = atom({ plugin: 'session-style', key: 'startTitle' } as const, null)
const queuedName = atom({ plugin: 'session-style', key: 'queuedName' } as const, null)
const isApplied = atom({ plugin: 'session-style', key: 'isApplied' } as const, false)

const isColor = (value: unknown): value is SessionStyleColor =>
  typeof value === 'string' && (COLORS as ReadonlyArray<string>).includes(value)

/** Pure: a prefix as given, or the reason it is not one. */
const checkPrefix = (value: string): { prefix: string } | { reason: string } => {
  const prefix = value.trim()
  if (prefix === '') return { reason: 'is empty' }
  if (/[\r\n]/.test(prefix)) return { reason: 'holds a line break' }
  if (prefix.length > MAX_PREFIX_CHARS) return { reason: `is ${prefix.length} characters; at most ${MAX_PREFIX_CHARS}` }
  return { prefix }
}

/** The defaults from the plugin's options; throws on a value the manifest does not allow. */
const parseDefaults = (options: Record<string, unknown>): SessionStyle => {
  const { color, namePrefix } = options
  if (color !== 'none' && !isColor(color)) {
    throw new Error(`${PLUGIN}: option "color" must be "none" or one of ${COLORS.join(', ')}, got ${JSON.stringify(color)}`)
  }
  if (typeof namePrefix !== 'string') {
    throw new Error(`${PLUGIN}: option "namePrefix" must be a string, got ${JSON.stringify(namePrefix)}`)
  }
  const checked = namePrefix.trim() === '' ? undefined : checkPrefix(namePrefix)
  if (checked !== undefined && 'reason' in checked) {
    throw new Error(`${PLUGIN}: option "namePrefix" ${checked.reason}: ${JSON.stringify(namePrefix)}`)
  }
  return {
    ...(color === 'none' ? {} : { color }),
    ...(checked === undefined ? {} : { namePrefix: checked.prefix }),
  }
}

/**
 * Pure: the style a project file sets, its fields over `defaults`. Throws naming the file and
 * the field when the file is not JSON, not an object, or holds a value /color or /rename would
 * not take. Keys other than `color` and `namePrefix` are ignored.
 */
export const parseStyleFile = (text: string, path: string, defaults: SessionStyle): SessionStyle => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`${PLUGIN}: ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${PLUGIN}: ${path} must hold a JSON object such as {"color": "blue", "namePrefix": "[api]"}`)
  }
  const { color, namePrefix } = parsed as Record<string, unknown>
  if (color !== undefined && !isColor(color)) {
    throw new Error(`${PLUGIN}: ${path}: "color" must be one of ${COLORS.join(', ')}, got ${JSON.stringify(color)}`)
  }
  if (namePrefix !== undefined && typeof namePrefix !== 'string') {
    throw new Error(`${PLUGIN}: ${path}: "namePrefix" must be a string, got ${JSON.stringify(namePrefix)}`)
  }
  const checked = namePrefix === undefined ? undefined : checkPrefix(namePrefix)
  if (checked !== undefined && 'reason' in checked) {
    throw new Error(`${PLUGIN}: ${path}: "namePrefix" ${checked.reason}`)
  }
  return {
    ...defaults,
    ...(color === undefined ? {} : { color }),
    ...(checked === undefined ? {} : { namePrefix: checked.prefix }),
  }
}

const hasPrefix = (name: string, prefix: string): boolean => name === prefix || name.startsWith(`${prefix} `)

/** Pure: `name` led by `prefix`, unchanged when it already is. */
export const withPrefix = (prefix: string, name: string): string => (hasPrefix(name, prefix) ? name : `${prefix} ${name}`)

/** Runs a built-in command; not awaited, since it runs only once the session is idle. */
const run = ($: EngineInterface, command: 'color' | 'rename', args: string): void => {
  $.command.run({ command, args }).then(
    () => undefined,
    (error: unknown) => $.ui.log(`${PLUGIN}: /${command} ${args} failed: ${String(error)}`),
  )
}

/**
 * Sets the color and leads the session's name (or its start title, or nothing) with the prefix.
 * The name is remembered as queued: a command runs only once the session is idle, and a rename
 * made before it runs (a prompt given on the command line, then a /rename) must not be undone.
 */
const apply = async ($: EngineInterface, applied: SessionStyle, title: string | null): Promise<void> => {
  if (applied.color !== undefined) run($, 'color', applied.color)
  if (applied.namePrefix === undefined || (title !== null && hasPrefix(title, applied.namePrefix))) return
  const name = title === null ? applied.namePrefix : withPrefix(applied.namePrefix, title)
  await update($, queuedName, () => name)
  run($, 'rename', name)
}

const joinPath = (dir: string, relative: string): string => (dir.endsWith('/') ? `${dir}${relative}` : `${dir}/${relative}`)

/** Pure: `dir` and each directory above it, nearest first, ending at `/`. */
export const ancestors = (dir: string): ReadonlyArray<string> => {
  const parts = dir.split('/').filter(part => part !== '')
  return parts.map((_, i) => `/${parts.slice(0, parts.length - i).join('/')}`).concat('/')
}

/**
 * The style file nearest the session's root, looked for up to the repository's top level (the
 * nearest directory holding `.git`); outside a repository, in the root alone. Null when none.
 */
const findStyleFile = async ($: EngineInterface): Promise<string | null> => {
  const dirs = ancestors(await $.session.root())
  let searched: ReadonlyArray<string> = dirs.slice(0, 1)
  for (const [i, dir] of dirs.entries()) {
    if (await $.fs.exists(joinPath(dir, '.git'))) {
      searched = dirs.slice(0, i + 1)
      break
    }
  }
  for (const dir of searched) {
    const path = joinPath(dir, STYLE_FILE)
    if (await $.fs.exists(path)) return path
  }
  return null
}

/**
 * Reads the style in force, keeps it for later renames and applies it to the session named
 * `title` (or unnamed). A broken project file is said in the transcript and nothing is
 * applied, so the mistake is seen and fixed.
 */
const styleSession = async ($: EngineInterface, defaults: SessionStyle, title: string | null): Promise<void> => {
  try {
    const path = await findStyleFile($)
    const resolved = path === null ? defaults : parseStyleFile(await $.fs.read(path), path, defaults)
    await update($, style, () => resolved)
    await update($, isApplied, () => true)
    await apply($, resolved, title)
  } catch (error) {
    await update($, style, () => null)
    $.ui.log(error instanceof Error ? error.message : `${PLUGIN}: ${String(error)}`)
  }
}

export const register: Register = (on, options) => {
  const defaults = parseDefaults(options)

  // Raised before session.start, where $.command.run is not yet available: keep the name.
  // After `/clear` it is raised in the new conversation, whose state starts empty and which
  // gets no session.start: style it here, once the session is idle. It carries the old
  // name over, so that name is renamed only when it lacks the prefix.
  on('classic.SessionStart', async ($, e, next) => {
    const trimmed = (e.session_title ?? '').trim()
    const title = trimmed === '' ? null : trimmed
    await update($, startTitle, () => title)
    if (e.source === 'clear') $.clock.after(1, () => void styleSession($, defaults, title))
    return next(e)
  })

  // Raised again on a reload (a /config change, a saved file), an enable or a worker respawn,
  // with this conversation's state kept: the style is applied once, or a name given since
  // would be overwritten.
  on('session.start', async ($, e, next) => {
    if (!(await read($, isApplied))) await styleSession($, defaults, await read($, startTitle))
    return next(e)
  })

  // `/rename <name>`, typed or run by another plugin, keeps the prefix in front, and cancels
  // the start name this mod queued if that has not run yet.
  on('command.run', { command: 'rename' }, async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name === PLUGIN) {
      const queued = await read($, queuedName)
      await update($, queuedName, () => null)
      return queued === e.args ? next(e) : { text: `${PLUGIN}: kept the name the session was given since it started` }
    }
    await update($, queuedName, () => null)
    const prefix = (await read($, style))?.namePrefix
    const name = e.args.trim()
    return prefix === undefined || name === '' ? next(e) : next({ ...e, args: withPrefix(prefix, name) })
  })
}
