import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  const word = options.word
  if (typeof word !== 'string' || word.trim() === '') {
    throw new Error(`turn-word: option "word" must be a non-empty string, got ${JSON.stringify(word)}`)
  }

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => next({ ...e, props: { ...e.props, word } }))
}
