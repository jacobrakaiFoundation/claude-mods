import type { AttributionTextKind, Register } from 'claude-code'

/** A Co-Authored-By trailer naming Claude at Anthropic's address: the model's name and the address. */
const CLAUDE_TRAILER = /^Co-Authored-By:[ \t]*(Claude\b[^<\n]*?)[ \t]*<([^>@\n]+@anthropic\.com)>[ \t]*$/gim

/** Any line break, so the format stays a single trailer line. */
const LINE_BREAK = /[\r\n\v\f\u0085\u2028\u2029]/

/** The texts that carry Claude's trailer; the exemption and remedy sentences are left as composed. */
const TRAILER_KINDS: ReadonlySet<AttributionTextKind> = new Set(['commit', 'pr'])

/** The trailer line `format` makes for one model name and address. */
const trailerLine = (format: string, model: string, email: string): string =>
  format.replaceAll('{model}', () => model).replaceAll('{email}', () => email)

/** `text` with each of Claude's Co-Authored-By trailers written in `format`; other lines as they were. */
const rewriteTrailers = (text: string, format: string): string =>
  text.replace(CLAUDE_TRAILER, (_, model: string, email: string) => trailerLine(format, model, email))

export const register: Register = (on, options) => {
  const format = options.format
  if (typeof format !== 'string' || format.trim() === '' || LINE_BREAK.test(format)) {
    throw new Error(`assisted-by: option "format" must be one non-empty line, got ${JSON.stringify(format)}`)
  }

  on('attribution.text', async ($, e, next) => {
    const composed = await next(e)
    if (!TRAILER_KINDS.has(e.kind)) return composed
    return { ...composed, text: rewriteTrailers(composed.text, format) }
  })
}
