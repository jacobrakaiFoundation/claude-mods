# no-auto-plan

A Claude Code mod that stops Claude from switching itself into plan mode. When the model calls `EnterPlanMode` on its own, the call is refused with a short note telling it to carry on with the task directly.

Plan mode stays yours: shift+tab still enters it, and asking for a plan in your prompt ("plan the migration first", "planning only") lets Claude enter it for that prompt. Your next prompt that does not mention a plan, or a turn you did not start (a background task's notification, a scheduled `/loop` prompt, another session's message), turns the guard back on.

Addresses [#23384](https://github.com/anthropics/claude-code/issues/23384), without a `permissions.deny` entry that hides plan mode entirely.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install no-auto-plan --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab). Or from a shell:

```bash
claude plugin install no-auto-plan --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

**Allow when asked** (default on): let Claude enter plan mode when your latest prompt mentions "plan", "plans", "planning" or "planned". Any mention counts, a negation too: "don't plan, just fix it" or "run terraform plan" also allows it, so turn the option off if your prompts often say "plan" without asking for one. Turn it off in `/config` to refuse every `EnterPlanMode` call; shift+tab still works.

Works in the terminal and the desktop app, wherever Claude can call `EnterPlanMode`.

## Develop

From `mods/no-auto-plan` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
