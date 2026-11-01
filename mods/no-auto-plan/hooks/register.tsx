import { atom, read, update } from 'claude-code'
import type { PluginOptions, PromptOrigin, Register } from 'claude-code'

import type { NoAutoPlanOptions } from '../types'

/** The prompt asks for a plan: "plan", "plans", "planning", "planned", not "planet". */
const ASKS_FOR_PLAN = /\bplan(s|ning|ned)?\b/i
/** Origins whose text is the person's own words. */
const PERSON_ORIGINS: ReadonlySet<PromptOrigin['kind']> = new Set(['composer', 'bridge', 'sdk', 'slack-ping'])

const askedForPlan = atom({ plugin: 'no-auto-plan', key: 'askedForPlan' } as const, false)

const parseOptions = (options: PluginOptions): NoAutoPlanOptions => {
  const allowWhenAsked = options.allowWhenAsked
  if (typeof allowWhenAsked !== 'boolean') {
    throw new Error(`no-auto-plan: option "allowWhenAsked" must be a boolean, got ${JSON.stringify(allowWhenAsked)}`)
  }
  return { allowWhenAsked }
}

export const register: Register = (on, options) => {
  const { allowWhenAsked } = parseOptions(options)

  if (allowWhenAsked) {
    on('prompt.submit', async ($, e, next) => {
      const isPerson = PERSON_ORIGINS.has(e.origin.kind)
      // A person's prompt sets it; a turn of its own from anyone else (a notification, a schedule, a peer) clears it.
      if (e.isMeta !== true && (isPerson || e.turnId === undefined)) {
        await update($, askedForPlan, () => isPerson && ASKS_FOR_PLAN.test(e.text))
      }
      return next(e)
    })
      // Failing to note the prompt must never stop it: it enters as typed.
      .catch(($, e, next) => next(e))
  }

  on('tool.call', { tool: 'EnterPlanMode' }, async ($, e, next) =>
    allowWhenAsked && (await read($, askedForPlan))
      ? next(e)
      : {
          deny: 'The user turned off entering plan mode on your own (no-auto-plan plugin). Do not try again; carry on with the task directly. The user can switch to plan mode themselves with shift+tab.',
        },
  ).catch(($, e, next) => (next.called ? next(e) : { deny: 'no-auto-plan: its check failed, so plan mode stays off.' }))
}
