import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AttributionTextKind, On } from 'claude-code'

const COMMIT = 'Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
const PR = '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>'

/** Stands for the engine beneath the plugin: it answers with the text it composed. */
const engine = (on: On) => on('attribution.text', (_, e) => ({ text: e.text }))

const compose = ($: Engine, kind: AttributionTextKind, text: string) =>
  $.attribution.text({ kind, text })

test('the commit trailer and the PR footer name Claude as Assisted-by, model kept', async ($, on) => {
  engine(on)
  expect((await compose($, 'commit', COMMIT)).text).toBe('Assisted-by: Claude Opus 4.6')
  expect((await compose($, 'pr', PR)).text).toBe(
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nAssisted-by: Claude Opus 4.6 (1M context)',
  )
})

test('the configured format is used', { options: { format: 'Assisted-by: {model} <{email}>' } }, async ($, on) => {
  engine(on)
  expect((await compose($, 'commit', COMMIT)).text).toBe('Assisted-by: Claude Opus 4.6 <noreply@anthropic.com>')
})

test('a human co-author, the exemption and the remedy are left as composed', async ($, on) => {
  engine(on)
  const human = `Co-Authored-By: Ada Lovelace <ada@example.com>\nCo-Authored-By: Claude Shannon <cshannon@mit.edu>\n${COMMIT}`
  expect((await compose($, 'commit', human)).text).toBe(
    'Co-Authored-By: Ada Lovelace <ada@example.com>\nCo-Authored-By: Claude Shannon <cshannon@mit.edu>\nAssisted-by: Claude Opus 4.6',
  )
  expect((await compose($, 'exemption', COMMIT)).text).toBe(COMMIT)
  expect((await compose($, 'remedy', COMMIT)).text).toBe(COMMIT)
})
