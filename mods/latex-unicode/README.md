# latex-unicode

A Claude Code mod that draws the LaTeX math in Claude's replies as Unicode in the terminal, so formulas read as formulas instead of backslashes:

```
$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$     →   ∑ᵢ₌₁ⁿ i = n(n+1)/2
$\alpha \leq \sqrt{x^2 + 1}$              →   α ≤ √(x² + 1)
$\int_0^1 x\,dx$, $x \in \mathbb{R}$      →   ∫₀¹ x dx, x ∈ ℝ
```

- Math inside `$...$` and `$$...$$` only; code spans and fenced code blocks are never touched.
- Greek letters, operators and relations (`\times`, `\cdot`, `\pm`, `\leq`, `\neq`, `\approx`, `\in`, `\to`, `\implies`, ...), `\sum`, `\prod`, `\int`, `\infty`, `\partial`, `\mathbb{R}`.
- Superscripts and subscripts in raised and lowered characters where Unicode has them (`x²`, `aᵢⱼ`); otherwise marked, as in `x_b` or `y^(qz)`.
- `\frac{a}{b}` as `a/b`, parenthesized where needed (`(a+b)/2`, `(1/2)mv²`); `\sqrt`, `\sqrt[3]` as `√`, `∛`; `\text{...}`, `\mathbf{...}`, accents (`\hat{n}` as `n̂`), `\left(` and `\right)`.
- Dollar amounts and shell variables (`$5 and $10`, `$5 for $x$`, `$HOME/$USER`, `${A}${B}`) are not taken for math; neither is `\$`, nor a `$$` whose partner is in another paragraph or around plain words.
- Math it cannot read (a `\begin{...}` environment, an unbalanced brace) is left as written; an unknown command is kept as written, with its brace groups.
- Only the drawing changes: the stored reply and what Claude reads keep the LaTeX.

Addresses [#44479](https://github.com/anthropics/claude-code/issues/44479).

Terminal sessions only: replies in the desktop app are left as Claude wrote them.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install latex-unicode --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install latex-unicode --marketplace jacobrakaiFoundation/claude-mods
```

## Develop

From `mods/latex-unicode` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

The converter is `hooks/latex.ts` (`renderMath` for a reply, `convertMath` for one formula); its cases are in `tests/latex.test.tsx`.

Mods are an early-access Claude Code feature; the API may change between releases.
