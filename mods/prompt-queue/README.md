# prompt-queue

A Claude Code mod that lines up your next prompts while Claude is still working. Each one is sent as your own message as soon as the turn before it finishes:

```
/queue add tests for the parser
/queue then update the changelog
```

- **`/queue <prompt>`** adds a prompt to the end of the queue. With no turn running it is sent at once.
- **`/queue`** lists what is waiting.
- **`/queue clear`** empties the queue.

Limits of a prompt a plugin sends for you:

- Slash commands cannot be queued: `/queue /commit` is refused with a message, since Claude Code does not let a plugin run a command as your prompt.
- `@file` mentions and pasted images are not expanded: `/queue review @src/parser.ts` sends the literal text `@src/parser.ts`, not the file. Name the file in words and Claude will read it.
- The transcript shows the prompt as sent by prompt-queue.
- `/queue clear` always empties the queue, so the single word `clear` cannot be queued as a prompt.

`/queue` runs at once even mid-turn, so it never interrupts or redirects the turn in progress. While prompts wait, the status line under the prompt shows `queued: 2`.

When a turn ends with an answer, the oldest queued prompt is submitted as your own message (a new turn, not folded into the old one). Only one is in flight at a time: the next waits until the one sent has started and answered. If Claude Code refuses a queued prompt (another plugin's or a settings hook's block), it goes back to the head of the queue and a line in the transcript says why. If you interrupt a turn with Esc, or it ends on an error or a refusal, the queue waits: it carries on after your next answered turn, or when you `/queue` another prompt while idle. The queue lasts for the session, `/clear` and `/reload-plugins` included, and is not kept after you exit.

Addresses [#33323](https://github.com/anthropics/claude-code/issues/33323) (a task queue for prompts) and [#63190](https://github.com/anthropics/claude-code/issues/63190) (deferred messages that fire at the end of the turn instead of interrupting it). It runs prompts one after another; it does not run them in parallel or in worktrees.

Works in the terminal and in the desktop app's Code tab.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install prompt-queue --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab).

From a shell:

```bash
claude plugin install prompt-queue --marketplace jacobrakaiFoundation/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `jacobrakaiFoundation/claude-mods`, then **Add plugin**.

## Develop

From `mods/prompt-queue` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
