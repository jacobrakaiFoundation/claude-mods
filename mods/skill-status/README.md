# skill-status

A Claude Code mod that shows which skill is running. When a skill loads, its name is pinned in the status line under the prompt:

```
Skill: commit-commands:commit
```

The line clears when no turn is running any more: the main turn and every subagent or teammate turn have ended, interrupted ones included. A background agent that loads a skill after the main turn has ended keeps the line until that agent finishes. If more than one skill loads, it shows the latest. A plugin's skill is shown with its plugin's name, as the Skill tool names it, even when a subagent preloads it by its bare name.

It shows a skill whether you typed `/name`, Claude called the Skill tool (inline or forked), or a subagent preloaded it. The line is set once the skill's text has been expanded; if another mod replaces that text (for example skill-blocklist's disabled notice, when it runs beneath this one), the line still names the skill.

Addresses [#16078](https://github.com/anthropics/claude-code/issues/16078): show the active skill in the status line. The issue asks for an `active_skill` field in the JSON given to a custom `statusLine` script. A mod can't add that field, so this mod pins its own line beside the engine's notices under the prompt. Your `statusLine` script keeps working as before.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install skill-status --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install skill-status --marketplace jacobrakaiFoundation/claude-mods
```

Works in terminal and desktop sessions. It has nothing to show under `claude -p`.

## Develop

From `mods/skill-status` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
