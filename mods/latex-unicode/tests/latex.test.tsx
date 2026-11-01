import { expect, test } from 'claude-code/testing'

import { convertMath, renderMath } from '../hooks/latex'

test('Greek letters, operators and relations', () => {
  expect(convertMath('\\alpha + \\beta \\times \\Gamma')).toBe('α + β × Γ')
  expect(convertMath('a \\leq b \\geq c \\neq d \\approx e')).toBe('a ≤ b ≥ c ≠ d ≈ e')
  expect(convertMath('x \\in \\mathbb{R}, \\forall \\epsilon > 0')).toBe('x ∈ ℝ, ∀ ϵ > 0')
  expect(convertMath('f: A \\to B \\implies \\neg p')).toBe('f: A → B ⟹ ¬ p')
  expect(convertMath('\\pm\\infty \\cdot \\partial \\nabla')).toBe('±∞ ⋅ ∂ ∇')
})

test('superscripts and subscripts, with a marker where Unicode has no raised or lowered form', () => {
  expect(convertMath('x^2 + y^{10} = z^{n+1}')).toBe('x² + y¹⁰ = zⁿ⁺¹')
  expect(convertMath('a_1 + a_{ij} + x_{max}')).toBe('a₁ + aᵢⱼ + xₘₐₓ')
  expect(convertMath("e^{i\\theta} + f'(x)")).toBe('eⁱᶿ + f′(x)')
  expect(convertMath('x_b + y^{qz}')).toBe('x_b + y^(qz)')
  expect(convertMath('90^\\circ')).toBe('90°')
  expect(convertMath('2^\\infty')).toBe('2^∞')
})

test('fractions, roots and big operators', () => {
  expect(convertMath('\\frac{a}{b}')).toBe('a/b')
  expect(convertMath('\\frac{a+b}{2}')).toBe('(a+b)/2')
  expect(convertMath('\\dfrac{\\pi}{2} + \\frac12')).toBe('π/2 + 1/2')
  expect(convertMath('\\sqrt{x} + \\sqrt{x^2 + 1}')).toBe('√x + √(x² + 1)')
  expect(convertMath('\\sqrt[3]{8} = \\sqrt[n]{a}')).toBe('∛8 = ⁿ√a')
  expect(convertMath('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}')).toBe('∑ᵢ₌₁ⁿ i = n(n+1)/2')
  expect(convertMath('\\int_0^1 x\\,dx')).toBe('∫₀¹ x dx')
  expect(convertMath('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1')).toBe('lim_(x→0) (sin x)/x = 1')
  expect(convertMath('\\sum\\limits_{i=1}^n \\sqrt[]{x}')).toBe('∑ᵢ₌₁ⁿ √x')
})

test('a fraction next to a factor, or after a slash, is parenthesized whole', () => {
  expect(convertMath('\\frac{1}{2}mv^2')).toBe('(1/2)mv²')
  expect(convertMath('\\frac{a}{b}c + \\frac{1}{2}\\sum x')).toBe('(a/b)c + (1/2)∑ x')
  expect(convertMath('a/\\frac{b}{c}')).toBe('a/(b/c)')
  expect(convertMath('\\frac{a}{b} c')).toBe('a/b c')
})

test('text, styles, accents and delimiters', () => {
  expect(convertMath('f(x) = 1 \\text{ if } x > 0')).toBe('f(x) = 1 if x > 0')
  expect(convertMath('\\mathbf{v} \\cdot \\hat{n}')).toBe('v ⋅ n̂')
  expect(convertMath('\\overrightarrow{AB}')).toBe('A⃗B⃗')
  expect(convertMath('\\left( \\frac{1}{2} \\right)')).toBe('( 1/2 )')
  expect(convertMath('\\{ x \\mid x > 0 \\}')).toBe('{ x ∣ x > 0 }')
  expect(convertMath('\\binom{n}{k}')).toBe('C(n, k)')
})

test('LaTeX it cannot read is left for the caller; unknown commands stay as written', () => {
  expect(convertMath('\\frac{a}{b')).toBeUndefined()
  expect(convertMath('\\begin{pmatrix} a & b \\end{pmatrix}')).toBeUndefined()
  expect(convertMath('x^')).toBeUndefined()
  expect(convertMath('\\foo{x}{y} + 1')).toBe('\\foo{x}{y} + 1')
})

test('inline and display math in markdown', () => {
  expect(renderMath('Let $\\alpha \\leq \\beta$ hold.')).toBe('Let α ≤ β hold.')
  expect(renderMath('The sum is\n\n$$\n\\sum_{k=1}^{n} k^2\n$$\n\ndone')).toBe('The sum is\n\n∑ₖ₌₁ⁿ k²\n\ndone')
  expect(renderMath('$x^2$ and $y_1$')).toBe('x² and y₁')
  expect(renderMath('$$\na = b\nc = d\n$$')).toBe('a = b\nc = d')
})

test('a bare $$ is not display math across paragraphs or around plain prose', () => {
  for (const text of ['The PID is $$.\n\nLater paragraph.\n\nAnd $$ again.', 'Use $$ in Makefiles and $$ again']) {
    expect(renderMath(text)).toBe(text)
  }
  expect(renderMath('PID $$ then $$x^2$$')).toBe('PID $$ then x²')
})

test('a price before math on the same line stays a price', () => {
  expect(renderMath('Cost: $5 for $x$ items')).toBe('Cost: $5 for x items')
  expect(renderMath('He paid $20, then $x$ more')).toBe('He paid $20, then x more')
  expect(renderMath('Set "${A}${B}" now')).toBe('Set "${A}${B}" now')
})

test('prices, shell variables and escaped dollars are not math', () => {
  for (const text of [
    'It costs $5 and $10 later.',
    'Between $5-$10 each.',
    'Set $HOME/$USER first.',
    'A lone $ sign.',
    'Escaped \\$x\\$ stays.',
    'Unclosed $x + y',
  ]) {
    expect(renderMath(text)).toBe(text)
  }
})

test('code spans and fenced code blocks are never converted', () => {
  const text = [
    'Math $\\alpha$ and code `$\\alpha$` and ``a ` $\\beta$``.',
    '```latex',
    '$\\gamma$',
    '```',
    '~~~~',
    '$$\\delta$$',
    '```',
    '~~~~',
    'after $\\pi$',
  ].join('\n')
  expect(renderMath(text)).toBe(
    [
      'Math α and code `$\\alpha$` and ``a ` $\\beta$``.',
      '```latex',
      '$\\gamma$',
      '```',
      '~~~~',
      '$$\\delta$$',
      '```',
      '~~~~',
      'after π',
    ].join('\n'),
  )
  expect(renderMath('```\nunclosed $\\alpha$')).toBe('```\nunclosed $\\alpha$')
  expect(renderMath('``` `x` ```\n$y$')).toBe('``` `x` ```\ny')
})

test('the terminal draws the reply with its math converted; other surfaces get it as written', async ($, on) => {
  let drawn: string | undefined
  on('ui.render', ($, e) => {
    if (e.component === 'AssistantMessage') drawn = e.props.text
    const { Text } = $.ui.resolve(e)
    return <Text>reply</Text>
  })
  const reply = {
    plugin: 'latex-unicode',
    component: 'AssistantMessage',
    requestId: 'reply-1',
    props: { text: 'Area is $\\pi r^2$, see `$x$`.', isFirstOfReply: true },
  } as const
  const terminal = await $.ui.mount({ ...reply, surface: 'terminal' })
  expect(drawn).toBe('Area is π r², see `$x$`.')
  await terminal.unmount()
  const desktop = await $.ui.mount({ ...reply, surface: 'desktop' })
  expect(drawn).toBe('Area is $\\pi r^2$, see `$x$`.')
  await desktop.unmount()
})
