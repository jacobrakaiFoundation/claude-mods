import type { Register } from 'claude-code'

import { renderMath } from './latex'

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage', surface: 'terminal' }, ($, e, next) => {
    const text = renderMath(e.props.text)
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })
}
