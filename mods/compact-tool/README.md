# compact-tool

A Claude Code mod that gives Claude a tool to compact its own conversation, so a long automated workflow (80 chapters, a batch of tickets) can compact at a natural boundary instead of waiting for you to type `/compact`. Addresses [#19877](https://github.com/anthropics/claude-code/issues/19877).

The tool is `mcp__compact-tool__compact`. It waits behind ToolSearch, so Claude loads it only when it looks for a way to compact, and its description tells Claude to use it only when you ask or when a long automated workflow says to compact between items, not after small steps of ordinary work. Its arguments, all optional:

| Argument | What it does |
|---|---|
| `instructions` | What the summary must keep, as you would type after `/compact` |
| `min_context_percent` | Compact only when the context window is at least this full; below it the call does nothing and Claude carries on |
| `resume_prompt` | Sent as the next prompt once compaction is done, so the work continues on its own |

Compaction cannot run mid-turn, so the tool queues `/compact` for the moment Claude's turn ends; the result tells Claude to end its turn. Then `resume_prompt` (if given) starts the next turn, shown as a message from the plugin. A workflow file can say, for example:

```
After each chapter: call the compact tool with min_context_percent 60,
instructions "keep the list of finished chapters", and
resume_prompt "Continue with the next chapter in current-task.md".
```

Only the main conversation can be compacted; a subagent's call is refused, and a second call in the same turn is refused while one is scheduled.

A session allows at most `maxCompactions` compactions through the tool (default 3; set it in `/config`), so a `resume_prompt` loop cannot compact and resume forever. Raise it before a long run (an 80-chapter workflow that compacts every few chapters needs more than 3). Past the limit the call is refused with a message saying so, and Claude carries on. Only compactions that actually happened count; your own `/compact` does not. `/clear` starts the count again, as does reloading the plugin (changing the option reloads it).

The compaction runs only when the turn ends with an answer. If you press Esc, or the turn ends on an error or a refusal, the compaction and `resume_prompt` are both dropped (one transcript line says so), so stopping the work stops it. `resume_prompt` is sent only after a compaction actually happened: if `/compact` fails, or a hook (another plugin's `session.compact`, a PreCompact settings hook) vetoes it, the reason is logged as a transcript line and the session waits for you.

Works in interactive sessions only, where a person is at the prompt. Under `claude -p` or the SDK no session is bound to run `/compact`, so the tool is not registered there and Claude never sees it.

## Install

At the prompt of a Claude Code session:

```
/plugin install compact-tool --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install compact-tool --marketplace jacobrakaiFoundation/claude-mods
```

## Develop

From `mods/compact-tool` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
