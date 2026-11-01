# compact-diffs

A Claude Code mod that folds the inline diff under every Edit and Write result into one dim line, for people who trust the change and want a shorter transcript ([#37951](https://github.com/anthropics/claude-code/issues/37951)):

```
⏺ Update(src/foo.ts)
  ⎿  Edited src/foo.ts (+3 -1)

⏺ Write(README.md)
  ⎿  Wrote README.md (42 lines)
```

- Edits show lines added and removed; a new file shows its line count, an overwrite its `+ -` counts (or `(N lines, no diff)` when Claude Code stored no patch for it: nothing changed, the diff timed out, or the old file was too large).
- Paths inside the session's folder are shown relative to it.
- A change held for review is marked `Staged edit to` / `Staged write to`.
- A result is folded only where Claude Code reports the view as folded, so ctrl+o (and `--verbose`) still draws the full diff; failed or refused calls keep their error text.
- Only the drawing changes: what Claude reads and the stored transcript are untouched.

Edit and Write are the tools folded: this build of Claude Code has no MultiEdit tool, and notebook edits are left as they are.

Works in terminal sessions. On a surface that does not report whether the view is expanded (the desktop app may not), the full diff is left as Claude Code draws it, since there would be no way back to it; where the desktop does report a folded view, the line is drawn without the `⎿` mark.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install compact-diffs --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install compact-diffs --marketplace jacobrakaiFoundation/claude-mods
```

## Develop

From `mods/compact-diffs` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
