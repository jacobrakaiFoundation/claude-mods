import { expect, test } from 'claude-code/testing'
import type { On, PromptSubmitInput } from 'claude-code'

const HOME = '/home/ada'
const PROJECT = '/work/app'

/** Stands for the engine beneath the plugin: these files exist, and it records the prompts that reach it. */
const engine = (on: On, files: Readonly<Record<string, string>>) => {
  const texts: string[] = []
  const logs: string[] = []
  on('env.get', () => ({ value: HOME }))
  on('session.root', () => ({ value: PROJECT }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`no file ${e.path}`)
    return { value: text }
  })
  on('prompt.submit', (_, e) => {
    texts.push(e.text)
    return { text: e.text }
  })
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return { texts, logs }
}

const PROMPT: PromptSubmitInput = { text: '', wait: false, origin: { kind: 'composer' } }

test(
  'phrases from the option and both files are replaced as whole words, any case',
  { options: { replacements: ['cube cuttle => kubectl', 'claude dot md => CLAUDE.md'] } },
  async ($, on) => {
    const { texts } = engine(on, {
      [`${HOME}/.claude/voice-fixups.json`]: JSON.stringify({ 'type script': 'TypeScript', 'cube cuttle': 'kubectl!' }),
      [`${PROJECT}/.claude/voice-fixups.json`]: JSON.stringify({ 'cube cuttle': 'kubectl' }),
    })

    await $.prompt.submit({ ...PROMPT, text: 'Run Cube  Cuttle get pods, then edit claude dot md in type script' })
    await $.prompt.submit({ ...PROMPT, text: 'cube cuttles and subtype scripts stay' })
    await $.prompt.submit({ ...PROMPT, text: 'cube cuttle from a peer', origin: { kind: 'peer' } })

    expect(texts).toEqual([
      'Run kubectl get pods, then edit CLAUDE.md in TypeScript',
      'cube cuttles and subtype scripts stay',
      'cube cuttle from a peer',
    ])
  },
)

test('an invalid file is reported in the transcript, and the prompt enters as dictated', async ($, on) => {
  const { texts, logs } = engine(on, { [`${PROJECT}/.claude/voice-fixups.json`]: JSON.stringify({ 'cube cuttle': 7 }) })
  await $.prompt.submit({ ...PROMPT, text: 'cube cuttle get pods' })
  expect(texts).toEqual(['cube cuttle get pods'])
  expect(logs).toEqual([
    `voice-fixups: ${PROJECT}/.claude/voice-fixups.json: "cube cuttle" must map to a string, got 7; this prompt entered without replacements`,
  ])
})
