import type { Register } from 'claude-code'

/** A listing line that opens an entry: `- name: description`, the name without spaces (`plugin:skill` allowed). */
const ENTRY_LINE = /^- ([^\s:]+(?::[^\s:]+)*)(?::|$)/

/** A skill's name as the Skill tool and `skill.prompt` spell it: no slash before it. */
const skillKey = (name: string): string => name.trim().replace(/^\//, '')

/** The configured names, refused unless every one is a non-empty string. */
const blockedSkills = (value: unknown): ReadonlySet<string> => {
  if (!Array.isArray(value)) {
    throw new Error(`skill-blocklist: option "skills" must be a list of skill names, got ${JSON.stringify(value)}`)
  }
  return new Set(
    value.map((name: unknown, index) => {
      if (typeof name !== 'string' || skillKey(name) === '') {
        throw new Error(
          `skill-blocklist: option "skills"[${index}] must be a non-empty skill name, got ${JSON.stringify(name)}`,
        )
      }
      return skillKey(name)
    }),
  )
}

/**
 * The skill a listing line opens, or undefined for the header or a line inside
 * an entry, a bulleted description line (`- SKIP when ...`) included.
 */
const entryName = (line: string): string | undefined => ENTRY_LINE.exec(line)?.[1]

/**
 * Whether `skill.prompt` names a blocked skill. A subagent's preload is named
 * as its agent wrote it, so a plugin's skill may arrive bare (`clean_gone`
 * from `commit-commands`): its qualified name is checked too.
 */
const isBlockedPrompt = (skill: string, pluginName: string | undefined, blocked: ReadonlySet<string>): boolean =>
  blocked.has(skill) || (pluginName !== undefined && !skill.includes(':') && blocked.has(`${pluginName}:${skill}`))

/**
 * The skill listing without the blocked skills' entries. An entry runs from its
 * `- name:` line up to the next one, so a description that wraps goes with it.
 */
const withoutBlocked = (listing: string, blocked: ReadonlySet<string>): string => {
  const kept: string[] = []
  let isDropping = false
  for (const line of listing.split('\n')) {
    const name = entryName(line)
    if (name !== undefined) isDropping = blocked.has(name)
    if (!isDropping) kept.push(line)
  }
  return kept.join('\n')
}

const disabledText = (skill: string): string =>
  `The skill "${skill}" is disabled by the skill-blocklist plugin and was not loaded. ` +
  'Tell the user it is disabled; do not try to carry it out from memory.'

export const register: Register = (on, options) => {
  const blocked = blockedSkills(options.skills)

  // A changed list reloads the mod: the listing and typeahead answers cached
  // under the old list are asked again, so blocking and unblocking both reach them.
  on('session.start', ($, e, next) => {
    $.ui.invalidate('prompt.attachment')
    $.ui.invalidate('command.describe')
    return next(e)
  })

  // What the model reads: the listing in the system reminder names no blocked skill.
  on('prompt.attachment', { type: 'skill_listing' }, ($, e, next) =>
    next({ ...e, text: withoutBlocked(e.text, blocked) }),
  )

  // What the person reads: the typeahead and /help leave it out.
  on('command.describe', ($, e, next) => (blocked.has(e.command) ? next({ ...e, isHidden: true }) : next(e)))

  // The model asks for it anyway: refused before the skill loads or a fork starts.
  on('tool.call', { tool: 'Skill' }, ($, e, next) =>
    blocked.has(skillKey(e.skill))
      ? { deny: `skill-blocklist: the skill "${skillKey(e.skill)}" is disabled.` }
      : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: 'skill-blocklist: its guard failed.' }))

  // Typed in full as /name, or preloaded into a subagent: the model reads a notice in its place.
  on('skill.prompt', ($, e, next) =>
    isBlockedPrompt(e.skill, e.pluginName, blocked) ? { text: disabledText(e.skill) } : next(e),
  )
}
