import type { Register } from 'claude-code'

/**
 * The skill's name as the Skill tool spells it. A subagent's preload is named
 * as its agent wrote it, so a plugin's skill named bare gets its plugin's name.
 */
const skillLabel = (skill: string, pluginName: string | undefined): string =>
  pluginName !== undefined && !skill.includes(':') ? `${pluginName}:${skill}` : skill

export const register: Register = on => {
  /** The turns running now, the main loop's and every agent's, by turn id. */
  const running = new Set<string>()

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    running.add(started.turnId)
    return started
  })

  // Raised for `/name`, the Skill tool (inline and forked) and a subagent's preload alike.
  on('skill.prompt', async ($, e, next) => {
    const prompt = await next(e)
    $.ui.status(`Skill: ${skillLabel(e.skill, e.pluginName)}`)
    return prompt
  })

  // The line stays while any turn runs, a background agent's after the main turn included.
  on('turn.complete', ($, e, next) => {
    running.delete(e.turnId)
    if (running.size === 0) $.ui.status(undefined)
    return next(e)
  })
}
