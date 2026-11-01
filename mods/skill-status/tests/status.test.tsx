import { expect, test } from 'claude-code/testing'
import type { On, TurnCompleteInput } from 'claude-code'

const TURN_END: TurnCompleteInput = { answer: 'done', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer' }

/** Stands for the engine beneath the plugin, keeping each status line it was asked to draw. */
const engine = (on: On, lines: (string | undefined)[]) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.status', (_, e) => {
    lines.push(e.text)
    return { value: undefined }
  })
}

test('a running skill is named in the status line until its turn ends', async ($, on) => {
  const lines: (string | undefined)[] = []
  engine(on, lines)

  await $.turn.start({ text: '/commit', turnId: 't1' })
  await $.turn.start({ text: 'go', turnId: 'a1-t', agentId: 'a1' })
  await $.skill.prompt({ skill: 'commit-commands:commit', text: 'Make a commit.' })
  expect(lines).toEqual(['Skill: commit-commands:commit'])

  await $.turn.complete({ ...TURN_END, turnId: 'a1-t', agentId: 'a1' })
  expect(lines).toEqual(['Skill: commit-commands:commit'])

  await $.turn.complete(TURN_END)
  expect(lines).toEqual(['Skill: commit-commands:commit', undefined])
})

test("a background agent's skill clears when that agent ends after the main turn", async ($, on) => {
  const lines: (string | undefined)[] = []
  engine(on, lines)

  await $.turn.start({ text: 'spawn it', turnId: 't1' })
  await $.turn.start({ text: 'clean up', turnId: 'bg-t', agentId: 'bg' })
  await $.turn.complete(TURN_END)
  // A preload named bare carries its plugin's name.
  await $.skill.prompt({ skill: 'clean_gone', pluginName: 'commit-commands', source: 'plugin', text: 'x' })
  expect(lines).toEqual(['Skill: commit-commands:clean_gone'])

  await $.turn.complete({ ...TURN_END, turnId: 'bg-t', agentId: 'bg' })
  expect(lines).toEqual(['Skill: commit-commands:clean_gone', undefined])
})
