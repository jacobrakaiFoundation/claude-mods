# effort-router

A Claude Code mod that sets the reasoning effort of one turn from the prompt itself. Put `!low`, `!medium`, `!high`, `!xhigh` or `!max` at the start or end of a prompt:

```
!high refactor the parser into a pipeline
rename foo to bar !low
```

The token is taken out before the prompt enters the session, so the model reads only `refactor the parser into a pipeline`, and every model request of that turn is sent at that effort. A toast says `effort high for this turn`. The next prompt without a token runs at the session's effort again (`/effort` still sets that). A token inside the prompt (`what does !max mean`) is left alone, and a token with nothing beside it (no text, no image) is refused.

Subagents keep their own effort. A model that takes no effort setting runs as usual, and a toast says the token was not applied.

Addresses [#95876](https://github.com/anthropics/claude-code/issues/95876) (inline effort for one prompt, no `/effort` before and after) and, through keyword rules, part of [#43326](https://github.com/anthropics/claude-code/issues/43326) (effort chosen by the task, not by hand).

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install effort-router --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install effort-router --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

**Keyword rules** (`/config`, empty by default) route prompts by how they start, one rule per entry as `phrase => level`:

```
quick => low
deep dive => max
```

A rule matches whole words in any case and any spacing between words (`Quick: what is 2+2` runs at `low`, `quickly explain` does not) and leaves the prompt's text as typed. A `!level` token wins over a rule. If a rule does not read `phrase => level`, a line in the transcript names it at your next prompt and keyword rules are off until you fix it; `!level` tokens keep working.

Works on prompts you type in the terminal or the desktop app, send over Remote Control, or pass to `claude -p`; not on slash commands or messages from other sessions, schedules or plugins. A prompt typed while a turn runs gets its level on the turn that later starts with its text; if Claude Code hands it to the running turn instead, its token is taken out but no level is applied.

## Develop

From `mods/effort-router` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
