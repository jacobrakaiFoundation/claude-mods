/**
 * Pure LaTeX-to-Unicode conversion for math in markdown: `$...$` and `$$...$$`
 * outside code spans and fenced code blocks.
 */

const SYMBOLS: Readonly<Record<string, string>> = {
  // Greek, lower case
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  // Greek, upper case
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Big operators
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮',
  bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂',
  // Binary operators
  times: '×', cdot: '⋅', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙', cup: '∪', cap: '∩', setminus: '∖', wedge: '∧',
  land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
  // Relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', in: '∈', notin: '∉',
  ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', mid: '∣', parallel: '∥',
  perp: '⊥', models: '⊨', vdash: '⊢', coloneqq: '≔', doteq: '≐',
  // Arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵', hookrightarrow: '↪',
  // Other symbols
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅',
  varnothing: '∅', angle: '∠', triangle: '△', square: '□', degree: '°', prime: '′', hbar: 'ℏ',
  ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘', top: '⊤', bot: '⊥', therefore: '∴',
  because: '∵', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  // Delimiters
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', lvert: '|',
  rvert: '|', vert: '|', lVert: '‖', rVert: '‖', Vert: '‖',
  // Spacing
  quad: '  ', qquad: '    ',
  // Placement of a big operator's limits, drawn as nothing
  limits: '', nolimits: '', displaylimits: '', mathop: '',
}

/** Operator names written upright: `\sin x` is "sin x". */
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'gcd',
  'deg', 'dim', 'ker', 'arg', 'Pr', 'mod', 'bmod',
])

/** One-character commands: `\,` `\{` `\%` and the rest. */
const PUNCTUATION: Readonly<Record<string, string>> = {
  ',': ' ', ';': ' ', ':': ' ', '>': ' ', ' ': ' ', '!': '',
  '{': '{', '}': '}', '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '|': '‖',
  '\\': '\n',
}

/** Commands that take one argument and draw it as written (`\text{if }`). */
const TEXT_COMMANDS = new Set(['text', 'textrm', 'textit', 'textbf', 'mbox', 'textnormal'])

/** Commands that take one argument and draw it as converted math (`\mathbf{v}`). */
const STYLE_COMMANDS = new Set([
  'mathrm', 'mathit', 'mathbf', 'mathsf', 'mathtt', 'boldsymbol', 'bm', 'operatorname', 'mathcal',
  'mathscr', 'mathfrak', 'displaystyle', 'textstyle',
])

const DOUBLE_STRUCK: Readonly<Record<string, string>> = {
  C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ', A: '𝔸', B: '𝔹', D: '𝔻', E: '𝔼', F: '𝔽',
  G: '𝔾', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', O: '𝕆', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎',
  X: '𝕏', Y: '𝕐', '1': '𝟙',
}

/** Combining marks the accent commands put after each character of their argument. */
const ACCENTS: Readonly<Record<string, string>> = {
  hat: '̂', widehat: '̂', bar: '̄', overline: '̅', underline: '̲',
  vec: '⃗', dot: '̇', ddot: '̈', tilde: '̃', widetilde: '̃', acute: '́',
  grave: '̀', breve: '̆', check: '̌', overrightarrow: '⃗', overleftarrow: '⃖',
}

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
  'α': 'ᵅ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'φ': 'ᵠ', 'ϕ': 'ᵠ', 'χ': 'ᵡ',
  '′': '′', '∘': '°', '°': '°', '*': '*', '∗': '*',
}

const SUBSCRIPTS: Readonly<Record<string, string>> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'φ': 'ᵩ', 'ϕ': 'ᵩ', 'χ': 'ᵪ',
}

/**
 * Whether a converted part reads ambiguously after `/` or `√` unless
 * parenthesized: it holds a space or an operator outside its own brackets.
 */
const needsParens = (text: string): boolean => {
  let depth = 0
  for (const c of text) {
    if ('([{⟨'.includes(c)) depth += 1
    else if (')]}⟩'.includes(c)) depth -= 1
    else if (depth === 0 && /[\s+\-−±∓×⋅÷=<>≤≥/,]/u.test(c)) return true
  }
  return false
}

const parenthesize = (text: string): string => (needsParens(text) ? `(${text})` : text)

/** `text` in raised (`table` SUPERSCRIPTS) or lowered characters, or with a `^`/`_` marker where one has none. */
const script = (text: string, table: Readonly<Record<string, string>>, marker: '^' | '_'): string => {
  const chars = [...text.replace(/\s+/gu, '')]
  const isAllMapped = chars.length > 0 && chars.every(c => table[c] !== undefined)
  if (isAllMapped) return chars.map(c => table[c]).join('')
  return chars.length === 1 ? `${marker}${chars.join('')}` : `${marker}(${chars.join('')})`
}

/** Thrown inside the parser for LaTeX it does not read; the caller leaves the math as written. */
class Unconvertible extends Error {}

type Parsed = { text: string; end: number }

/** `a` then `b`, one space where both bring one. */
const joinSpaced = (a: string, b: string): string => (a.endsWith(' ') && b.startsWith(' ') ? a + b.slice(1) : a + b)

const isLetter = (c: string | undefined): boolean => c !== undefined && /[A-Za-z]/.test(c)

/** The command name at `start` (just past the backslash) and the index after it. */
const readName = (src: string, start: number): { name: string; end: number } => {
  if (start >= src.length) throw new Unconvertible('a backslash ends the math')
  if (!isLetter(src[start])) return { name: src.charAt(start), end: start + 1 }
  let end = start
  while (isLetter(src[end])) end += 1
  return { name: src.slice(start, end), end }
}

const skipSpaces = (src: string, i: number): number => {
  let at = i
  while (at < src.length && /\s/u.test(src.charAt(at))) at += 1
  return at
}

/** The raw text of the brace group opening at `start` (no conversion), for `\text{...}`. */
const rawGroup = (src: string, start: number): Parsed => {
  if (src[start] !== '{') throw new Unconvertible('a text command without a brace group')
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '\\') {
      i += 1
      continue
    }
    if (src[i] === '{') depth += 1
    if (src[i] === '}') depth -= 1
    if (depth === 0) return { text: src.slice(start + 1, i).replace(/\\([{}%$&#_])/gu, '$1'), end: i + 1 }
  }
  throw new Unconvertible('an unclosed brace')
}

/** One argument: a brace group, a command, or a single character. */
const readArg = (src: string, i: number): Parsed => {
  const at = skipSpaces(src, i)
  const c = src[at]
  if (c === undefined) throw new Unconvertible('a command or script is missing its argument')
  if (c === '{') {
    const group = parseUntil(src, at + 1, '}')
    return { text: group.text, end: group.end + 1 }
  }
  if (c === '\\') return parseCommand(src, at + 1)
  if (c === '}' || c === '^' || c === '_') throw new Unconvertible(`"${c}" where an argument belongs`)
  const codePoint = src.codePointAt(at)
  if (codePoint === undefined) throw new Error(`latex-unicode: no character at ${at} of ${JSON.stringify(src)}`)
  const char = String.fromCodePoint(codePoint)
  return { text: char, end: at + char.length }
}

/** An optional `[...]` argument at `i`, or undefined. */
const readOptional = (src: string, i: number): Parsed | undefined => {
  const at = skipSpaces(src, i)
  if (src[at] !== '[') return undefined
  const group = parseUntil(src, at + 1, ']')
  return { text: group.text, end: group.end + 1 }
}

const ROOTS: Readonly<Record<string, string>> = { '2': '√', '3': '∛', '4': '∜' }

/** The command whose name starts at `start`, just past its backslash. */
const parseCommand = (src: string, start: number): Parsed => {
  const { name, end } = readName(src, start)
  const symbol = SYMBOLS[name] ?? PUNCTUATION[name]
  if (symbol !== undefined) return { text: symbol, end }
  if (FUNCTIONS.has(name)) return { text: name === 'bmod' ? ' mod ' : name, end }

  if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
    const numerator = readArg(src, end)
    const denominator = readArg(src, numerator.end)
    const text = `${parenthesize(numerator.text)}/${parenthesize(denominator.text)}`
    // "1/2mv²" and "a/b/c" read as other values: a factor right after, or a `/` before, takes the whole fraction in parentheses.
    const isFactor = /[A-Za-z0-9(]/.test(src.charAt(denominator.end)) || (src[denominator.end] === '\\' && isLetter(src[denominator.end + 1]))
    const isDivisor = src.slice(0, start - 1).trimEnd().endsWith('/')
    return { text: isFactor || isDivisor ? `(${text})` : text, end: denominator.end }
  }
  if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
    const n = readArg(src, end)
    const k = readArg(src, n.end)
    return { text: `C(${n.text}, ${k.text})`, end: k.end }
  }
  if (name === 'sqrt') {
    const index = readOptional(src, end)
    const radicand = readArg(src, index?.end ?? end)
    const sign = index === undefined || index.text.trim() === '' ? '√' : (ROOTS[index.text.trim()] ?? `${script(index.text, SUPERSCRIPTS, '^')}√`)
    return { text: `${sign}${parenthesize(radicand.text)}`, end: radicand.end }
  }
  if (name === 'mathbb' || name === 'mathbbm') {
    const arg = readArg(src, end)
    return { text: [...arg.text].map(c => DOUBLE_STRUCK[c] ?? c).join(''), end: arg.end }
  }
  if (TEXT_COMMANDS.has(name)) return rawGroup(src, skipSpaces(src, end))
  if (STYLE_COMMANDS.has(name)) {
    // \displaystyle and \textstyle switch a mode and take no argument.
    if (name === 'displaystyle' || name === 'textstyle') return { text: '', end }
    return readArg(src, end)
  }
  const accent = ACCENTS[name]
  if (accent !== undefined) {
    const arg = readArg(src, end)
    return { text: [...arg.text].map(c => `${c}${accent}`).join(''), end: arg.end }
  }
  if (name === 'left' || name === 'right' || name === 'bigl' || name === 'bigr' || name === 'Bigl' || name === 'Bigr' || name === 'big' || name === 'Big') {
    // The sizing commands draw their delimiter as is; `\left.` draws nothing.
    const at = skipSpaces(src, end)
    if (src[at] === '.') return { text: '', end: at + 1 }
    return { text: '', end }
  }
  if (name === 'not') {
    const arg = readArg(src, end)
    return { text: `${arg.text}̸`, end: arg.end }
  }
  if (name === 'begin' || name === 'end') throw new Unconvertible(`\\${name} environments are not converted`)
  // An unknown command stays as written with its brace groups, so nothing the reader needs is dropped.
  let groupsEnd = end
  while (src[groupsEnd] === '{') groupsEnd = rawGroup(src, groupsEnd).end
  return { text: src.slice(start - 1, groupsEnd), end: groupsEnd }
}

/** Converts from `start` up to the `stop` character (or the end), which it does not consume. */
const parseUntil = (src: string, start: number, stop: '}' | ']' | undefined): Parsed => {
  let text = ''
  let i = start
  while (i < src.length) {
    const c = src.charAt(i)
    if (c === stop) return { text, end: i }
    if (c === '}') throw new Unconvertible('an unopened brace')
    if (c === '{') {
      const group = parseUntil(src, i + 1, '}')
      text += group.text
      i = group.end + 1
    } else if (c === '\\') {
      const command = parseCommand(src, i + 1)
      text = joinSpaced(text, command.text)
      i = command.end
    } else if (c === '^' || c === '_') {
      const arg = readArg(src, i + 1)
      text += c === '^' ? script(arg.text, SUPERSCRIPTS, '^') : script(arg.text, SUBSCRIPTS, '_')
      i = arg.end
    } else if (/\s/u.test(c)) {
      const next = skipSpaces(src, i)
      // Display math keeps its top-level line breaks.
      const space = stop === undefined && src.slice(i, next).includes('\n') ? '\n' : ' '
      if (!text.endsWith(' ') && !text.endsWith('\n')) text += space
      i = next
    } else if (c === '~') {
      text += ' '
      i += 1
    } else if (c === "'") {
      text += '′'
      i += 1
    } else {
      text += c
      i += 1
    }
  }
  if (stop !== undefined) throw new Unconvertible(`an unclosed "${stop === '}' ? '{' : '['}"`)
  return { text, end: i }
}

/**
 * Pure: one math body (what sits between the dollars) as Unicode, or undefined
 * when it holds LaTeX this converter does not read (an environment, an
 * unbalanced brace), for the caller to leave as written.
 */
export const convertMath = (body: string): string | undefined => {
  try {
    return parseUntil(body, 0, undefined).text.trim()
  } catch (error) {
    if (error instanceof Unconvertible) return undefined
    throw error
  }
}

/** The index of the next `$` at or after `from` that is not escaped, or -1. */
const nextDollar = (text: string, from: number): number => {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '$') return i
  }
  return -1
}

/**
 * The closing `$` of inline math opened at `open`, on the same line: not
 * after a space (pandoc's rule) and not before a letter, digit or brace, so
 * neither "$5 and $10" nor "$HOME/$USER" nor "${A}${B}" is math; -1 when
 * there is none, or when a `$` after a space comes first: that one opens
 * something of its own ("$5 for $x$" is a price, then math).
 */
const inlineClose = (text: string, open: number): number => {
  const lineEnd = text.indexOf('\n', open)
  const limit = lineEnd === -1 ? text.length : lineEnd
  for (let i = nextDollar(text, open + 1); i !== -1 && i < limit; i = nextDollar(text, i + 1)) {
    if (/\s/u.test(text.charAt(i - 1))) return -1
    const isClose = !/[A-Za-z0-9{]/.test(text.charAt(i + 1)) && text[i + 1] !== '$'
    if (isClose) return i
  }
  return -1
}

/**
 * The closing `$$` of display math opened at `open`, in the same paragraph,
 * or -1. A body that does not look like math ("$$ in Makefiles and $$",
 * the shell's PID) is not closed: opened by a space or punctuation and
 * holding none of `\`, `^`, `_`, `{`.
 */
const displayClose = (text: string, open: number): number => {
  const close = text.indexOf('$$', open + 2)
  if (close === -1) return -1
  if (/\n[ \t]*\n/u.test(text.slice(open + 2, close))) return -1
  const opensMath = /[A-Za-z0-9\\\n]/.test(text.charAt(open + 2)) || /[\\^_{]/.test(text.slice(open + 2, close))
  return opensMath ? close : -1
}

/** Converts the math in a stretch of markdown that holds no code. */
const convertProse = (text: string): string => {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = nextDollar(text, i)
    if (open === -1) return out + text.slice(i)
    out += text.slice(i, open)
    if (text[open + 1] === '$') {
      const close = displayClose(text, open)
      const converted = close === -1 ? undefined : convertMath(text.slice(open + 2, close))
      if (close === -1 || converted === undefined || converted === '') {
        out += '$$'
        i = open + 2
      } else {
        out += converted
        i = close + 2
      }
      continue
    }
    const opensMath = text[open + 1] !== undefined && !/\s/u.test(text.charAt(open + 1))
    const close = opensMath ? inlineClose(text, open) : -1
    const converted = close === -1 ? undefined : convertMath(text.slice(open + 1, close))
    if (close === -1 || converted === undefined) {
      out += '$'
      i = open + 1
    } else {
      out += converted
      i = close + 1
    }
  }
  return out
}

type Piece = { isCode: boolean; text: string }

/** Splits a run of non-fenced markdown into code spans and the prose around them. */
const splitCodeSpans = (text: string): Piece[] => {
  const pieces: Piece[] = []
  let proseStart = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] === '`') {
      i += 2
      continue
    }
    if (text[i] !== '`') {
      i += 1
      continue
    }
    let run = i
    while (text[run] === '`') run += 1
    const ticks = text.slice(i, run)
    // A span closes at the next run of exactly as many backticks.
    const closer = new RegExp(`(?<!\`)${ticks}(?!\`)`, 'gu')
    closer.lastIndex = run
    const match = closer.exec(text)
    if (match === null) {
      i = run
      continue
    }
    pieces.push({ isCode: false, text: text.slice(proseStart, i) })
    pieces.push({ isCode: true, text: text.slice(i, match.index + ticks.length) })
    i = match.index + ticks.length
    proseStart = i
  }
  pieces.push({ isCode: false, text: text.slice(proseStart) })
  return pieces
}

/** A fence line; a backtick fence's info string holds no backtick (CommonMark). */
const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/u

/** Splits markdown into fenced code blocks and the rest, line by line. */
const splitFences = (markdown: string): Piece[] => {
  const pieces: Piece[] = []
  const lines = markdown.split(/(?<=\n)/u)
  let current: Piece = { isCode: false, text: '' }
  let fence: string | undefined
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1]
    if (fence === undefined && marker !== undefined) {
      pieces.push(current)
      current = { isCode: true, text: line }
      fence = marker
    } else if (fence !== undefined && marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
      current.text += line
      pieces.push(current)
      current = { isCode: false, text: '' }
      fence = undefined
    } else {
      current.text += line
    }
  }
  pieces.push(current)
  return pieces
}

/**
 * Pure: markdown with its `$...$` and `$$...$$` math drawn as Unicode; code
 * spans and fenced code blocks, and math it cannot read, left as written.
 */
export const renderMath = (markdown: string): string =>
  splitFences(markdown)
    .flatMap(block => (block.isCode ? [block] : splitCodeSpans(block.text)))
    .map(piece => (piece.isCode ? piece.text : convertProse(piece.text)))
    .join('')
