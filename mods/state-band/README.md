# state-band

A Claude Code mod that puts one line above the prompt, in the terminal and the desktop app, saying what state the session is in, so you can tell at a glance whether Claude still needs you:

```
● working
? waiting  Bash needs your permission
? waiting  Claude asked you a question
✓ done  14:35 · took 1m 4s
✗ interrupted  14:36
✗ error  14:40
○ idle
```

- **working**: a turn is running.
- **waiting**: a permission dialog is open for a tool, or Claude asked a question with its question dialog. Waiting outranks working. No event marks your answer to a permission dialog, so after you approve, **waiting** stays until that tool call finishes (for a long `npm test`, its whole run).
- **done**: the last turn answered, with the time it ended and how long it took.
- **interrupted / error / refused**: the last turn was stopped with Esc, ended on an API error, or was refused by the model.
- **idle**: no turn yet in this conversation (and again after `/clear`).

Colours follow your theme (`claude`, `permission`, `suggestion`, `success`, `error`). The line steps aside while a survey holds the band.

Addresses [#21894](https://github.com/anthropics/claude-code/issues/21894) (visual prompt state indicators).

Not detected: a question Claude asks in plain text at the end of an answer reads as **done**, not waiting; permission dialogs that raise no `PermissionRequest` (auto mode falling back to asking you, `Enter plan mode?`, upload safety checks, access-change asks) read as **working**; background agents still running after the main turn ended are not shown; a tool error inside a turn that then answers still reads as **done**.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install state-band --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab). Or from a shell:

```bash
claude plugin install state-band --marketplace jacobrakaiFoundation/claude-mods
```

The band above the prompt holds one drawing: with another mod that draws there (such as usage-meter or buddy), only one of them shows.

## Develop

From `mods/state-band` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
