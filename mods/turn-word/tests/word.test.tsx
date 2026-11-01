import { expect, test } from 'claude-code/testing'

const LINE = {
  plugin: 'turn-word',
  component: 'TurnDuration',
  surface: 'terminal',
  props: { word: 'Sautéed', durationMs: 3000 },
} as const

test('the engine draws the configured word in place of the sampled one', async ($, on) => {
  let drawnWord: string | undefined
  on('ui.render', ($, e) => {
    if (e.component === 'TurnDuration') drawnWord = e.props.word
    const { Text } = $.ui.resolve(e)
    return <Text>line</Text>
  })
  const ui = await $.ui.mount(LINE)
  expect(drawnWord).toBe('Worked')
  await ui.unmount()
})

test('a word set in the config menu is used', { options: { word: 'Done' } }, async ($, on) => {
  let drawnWord: string | undefined
  on('ui.render', ($, e) => {
    if (e.component === 'TurnDuration') drawnWord = e.props.word
    const { Text } = $.ui.resolve(e)
    return <Text>line</Text>
  })
  const ui = await $.ui.mount(LINE)
  expect(drawnWord).toBe('Done')
  await ui.unmount()
})
