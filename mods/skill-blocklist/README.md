# skill-blocklist

A Claude Code mod that switches off the skills you name, plugin skills included, without editing or uninstalling anything. A blocked skill is stopped at every layer the mod API reaches:

| Layer | What happens to a blocked skill |
| --- | --- |
| The model's skill listing (the `skill_listing` system reminder) | Its entry is removed, wrapped description lines too, so the model does not see it listed and spends no tokens on it |
| The Skill tool | A call naming it is refused before anything loads: `skill-blocklist: the skill "<name>" is disabled.` |
| Typing `/<name>`, or a subagent preloading it | The skill's body is replaced by a short notice that it is disabled, so its instructions never reach the model |
| The `/` typeahead and `/help` | It is hidden |

The Skill tool's own description lists no skills, so there is nothing to remove there.

Addresses:

- [#14920](https://github.com/anthropics/claude-code/issues/14920): disable individual plugin skills
- [#30355](https://github.com/anthropics/claude-code/issues/30355): stop skills from auto-triggering, built-in ones included (per skill, not globally)
- [#12633](https://github.com/anthropics/claude-code/issues/12633): keep a skill's metadata out of the main agent's prompt. The block covers subagents too, so this is a way to remove a skill everywhere, not to make it subagent-only

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install skill-blocklist --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install skill-blocklist --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

The list is the plugin's **Blocked skills** option (empty by default), set in `/config`. Name each skill as the Skill tool does: `commit`, or `plugin:skill` for a plugin's skill (`commit-commands:clean_gone`). A leading `/` is ignored. Changing the list reloads the mod, and the Skill tool and `/name` follow the new list at once. On load the mod also asks the engine to recompute the model's skill listing and the typeahead, so a newly blocked skill drops out of them and an unblocked one comes back. If either still shows the old list, it catches up in a new session.

A subagent that preloads a plugin's skill by its bare name (`clean_gone`) is blocked too when you listed it as `commit-commands:clean_gone`.

Works in terminal and desktop sessions, and in `claude -p`: everything it changes is what the model reads and what the Skill tool runs.

## Develop

From `mods/skill-blocklist` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
