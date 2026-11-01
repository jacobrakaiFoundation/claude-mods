import type { PluginOptions, Register } from 'claude-code'
import { classify, denyMessage, RULES, type Rule } from './classify'

/** The option that keeps the rules on in bypass-permissions mode, whose system prompt asks for cat/grep/sed in Bash. */
const ENFORCE_IN_BYPASS = 'enforceInBypass'

/** One boolean option; anything else is a broken config. */
const booleanOption = (options: PluginOptions, key: string): boolean => {
  const value = options[key]
  if (typeof value !== 'boolean') {
    throw new Error(`prefer-builtin-tools: option "${key}" must be a boolean, got ${JSON.stringify(value)}`)
  }
  return value
}

/** The rules switched on in the plugin's options. */
const enabledRules = (options: PluginOptions): ReadonlySet<Rule> =>
  new Set(RULES.filter(rule => booleanOption(options, rule)))

export const register: Register = (on, options) => {
  const enabled = enabledRules(options)
  const isEnforcedInBypass = booleanOption(options, ENFORCE_IN_BYPASS)
  // The main loop's permission mode as the last classic event that carries it saw it.
  let isBypass = false

  const noteMode = (e: { permission_mode?: string; agent_id?: string }) => {
    if (e.agent_id === undefined) isBypass = e.permission_mode === 'bypassPermissions'
  }

  on('classic.UserPromptSubmit', ($, e, next) => {
    noteMode(e)
    return next(e)
  })

  // A mode switched mid-turn (shift+tab) shows here, after the next tool call.
  on('classic.PostToolUse', ($, e, next) => {
    noteMode(e)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    // Only the model's own calls: a plugin running Bash through $.tool.call wants its output, not advice.
    if (next.origin.plugin !== 'engine') return next(e)
    // A subagent's tools are not knowable from a hook ($.tool.list is the main loop's), so it is never turned back.
    if (e.agentId !== undefined) return next(e)
    if (isBypass && !isEnforcedInBypass) return next(e)
    const suggestion = classify(e.command)
    if (suggestion === undefined || !enabled.has(suggestion.rule)) return next(e)
    // Never point to a tool the session does not have (left out of this build, or disallowed).
    const tools = await $.tool.list()
    return tools.some(tool => tool.name === suggestion.tool) ? { deny: denyMessage(suggestion) } : next(e)
  })
}
