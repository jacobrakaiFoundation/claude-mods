import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const COMMAND = 'queue'

const prompts = atom({ plugin: 'prompt-queue', key: 'prompts' } as const, [])
const isTurnRunning = atom({ plugin: 'prompt-queue', key: 'isTurnRunning' } as const, false)
const isSubmitPending = atom({ plugin: 'prompt-queue', key: 'isSubmitPending' } as const, false)

type QueueCommand = { kind: 'list' } | { kind: 'clear' } | { kind: 'add'; prompt: string }

/** "/queue" lists, "/queue clear" empties, anything else is a prompt to add. */
const parseCommand = (args: string): QueueCommand => {
  const prompt = args.trim()
  if (prompt === '') return { kind: 'list' }
  if (prompt === 'clear') return { kind: 'clear' }
  return { kind: 'add', prompt }
}

const statusText = (list: readonly string[]): string | undefined =>
  list.length === 0 ? undefined : `queued: ${list.length}`

const listText = (list: readonly string[]): string =>
  list.length === 0
    ? 'The queue is empty. Add a prompt with /queue <prompt>.'
    : [`${list.length} queued:`, ...list.map((prompt, i) => `${i + 1}. ${prompt}`)].join('\n')

/** Writes the queue and keeps the status line in step with it. */
const setQueue = async ($: EngineInterface, change: (list: string[]) => string[]): Promise<string[]> => {
  const list = await update($, prompts, change)
  $.ui.status(statusText(list))
  return list
}

/**
 * Claims the single submit slot and takes the oldest prompt off the queue.
 * Undefined when a submit is still pending (its turn has not started yet) or
 * the queue is empty, so one queued prompt never starts before the last one.
 */
const takeNext = async ($: EngineInterface): Promise<string | undefined> => {
  let wasPending = false
  await update($, isSubmitPending, current => {
    wasPending = current
    return true
  })
  if (wasPending) return undefined
  let head: string | undefined
  await setQueue($, list => {
    head = list[0]
    return list.slice(1)
  })
  if (head === undefined) await update($, isSubmitPending, () => false)
  return head
}

/** Puts a prompt that did not enter back at the head of the queue, and says why. */
const putBack = async ($: EngineInterface, prompt: string, reason: string): Promise<void> => {
  await setQueue($, list => [prompt, ...list])
  $.ui.log(
    `prompt-queue: the queued prompt was not submitted (${reason}); it is back at the head of the queue and waits for your next answered turn or /queue: ${prompt}`,
  )
}

/**
 * Submits a prompt taken by `takeNext` as the person's own, a turn of its own
 * once the session is idle. Not awaited by the caller: the submit resolves only
 * as that turn starts (or is queued), after the current one has ended.
 */
const submit = async ($: EngineInterface, prompt: string): Promise<void> => {
  try {
    const submitted = await $.prompt.submit({ text: prompt, asUser: true })
    if (submitted.drop !== undefined) await putBack($, prompt, submitted.drop)
  } catch (error: unknown) {
    // The host refused it: keep the prompt rather than lose it, and report the error.
    await putBack($, prompt, String(error))
  } finally {
    await update($, isSubmitPending, () => false)
  }
}

const startSubmit = ($: EngineInterface, prompt: string): void => {
  submit($, prompt).catch((error: unknown) => {
    $.ui.log(`prompt-queue: restoring the queue after a failed submit of "${prompt}" failed: ${String(error)}`)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Queue a prompt to run when the current turn ends; no argument lists the queue, "clear" empties it',
      argumentHint: '[prompt | clear]',
      // Typed mid-turn, the command must run at once, not wait for the turn it queues behind.
      immediate: true,
    })
    // This fires again on a reload or a worker respawn, which drops the in-flight
    // submit that would release the slot: release it here, or the queue never advances.
    await update($, isSubmitPending, () => false)
    $.ui.status(statusText(await read($, prompts)))
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const command = parseCommand(e.args)
    if (command.kind === 'list') return { text: listText(await read($, prompts)) }
    if (command.kind === 'clear') {
      const dropped = (await read($, prompts)).length
      await setQueue($, () => [])
      return { text: `Cleared ${dropped} queued prompt${dropped === 1 ? '' : 's'}.` }
    }

    if (command.prompt.startsWith('/')) {
      return {
        text: `Not queued: ${command.prompt}\nA plugin cannot submit a slash command as your prompt; run it yourself when the turn ends.`,
      }
    }

    const list = await setQueue($, current => [...current, command.prompt])
    const queued = `Queued #${list.length}: ${command.prompt}`
    if (await read($, isTurnRunning)) return { text: queued }
    // With no turn running, nothing would end to start the queue: submit its head now.
    const head = await takeNext($)
    if (head === undefined) return { text: queued }
    // The host refuses a submit made while this command.run hook still holds the turn: submit once it has answered.
    $.clock.after(0, () => startSubmit($, head))
    return {
      text: list.length === 1 ? `Submitting: ${head}` : `Submitting: ${head}\nQueued #${list.length - 1}: ${command.prompt}`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isTurnRunning, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await update($, isTurnRunning, () => false)
    // An interrupt, refusal or API error leaves the queue waiting for the person.
    if (e.reason !== 'answer') return result
    const head = await takeNext($)
    if (head !== undefined) startSubmit($, head)
    return result
  })
}
