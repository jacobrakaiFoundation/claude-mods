# tool-group-names

A Claude Code mod that says **which** files sit behind a folded tool line, so you don't have to press ctrl+o on every one:

```
Read 3 files (ctrl+o to expand)
⎿  ClaudePinchZoom/README.md, ClaudeEnterKey/README.md, claude-usage-meter/README.md
```

- Files by name; the parent folder is added where two share a name.
- Grep patterns in quotes, Glob patterns as written.
- `✗` marks a call that failed or a hook blocked.
- After 4 names the rest are counted (`+3`); the line truncates rather than wraps.
- Claude Code's own line is kept as is; expanded groups are left alone.

Terminal sessions only: the desktop app draws tool calls its own way.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install tool-group-names --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install tool-group-names --marketplace jacobrakaiFoundation/claude-mods
```

## Develop

From `mods/tool-group-names` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
