# idle-compact

A Claude Code mod that compacts the conversation when you step away, just before the prompt cache expires. Coming back to a long conversation after the cache has gone means the next prompt re-reads the whole context at full price; compacting while the cache is still warm makes that next prompt read a short summary instead.

After a turn ends, it waits. If no prompt is sent for **55 minutes** after the turn's last response and the context window is at least **40%** full, it runs the same compaction as `/compact` and leaves a line in the transcript:

```
idle-compact: idle for 55 min at 62% context, compacting before the prompt cache expires
```

The wait always counts from the main turn's last response, since that is when the prompt cache was last refreshed. Starting a turn stops the wait and the turn's end starts it over. Anything that leaves the session idle without asking the model (a local command such as `/context`, `/cost` or `/model`, a prompt blocked before it becomes a turn, or reloading the mod with a `/config` change of its options) keeps the same end time instead of starting a full wait again. If that time has already passed, the cache is likely cold and it does not compact. A fresh session start waits for the first response before it starts timing.

It never compacts while a turn runs or while a prompt is half typed in the prompt box at the moment the wait ends, and it compacts once per idle stretch. When the wait ends without compacting (a draft is in the box, the context is under the threshold, or its fill is not known yet, as after a manual `/compact`), or is skipped because the cache is likely cold, it says why in the debug log (`claude --debug`). Subagents finishing in the background do not count as the session going idle.

Addresses [#66115](https://github.com/anthropics/claude-code/issues/66115) (auto-compact on idle timeout to prevent cache expiry cost).

Works in the terminal and in the desktop app's Code tab.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install idle-compact --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab).

From a shell:

```bash
claude plugin install idle-compact --marketplace jacobrakaiFoundation/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `jacobrakaiFoundation/claude-mods`, then **Add plugin**.

## Configure

Two options, set in `/config`:

- **Idle minutes** (default `55`): how long after the last response a session sits idle before compacting. Keep it just under your prompt cache's lifetime. The default assumes a 1-hour cache. On the 5-minute cache, set `4`; at that length it compacts after any short pause, and each compaction is itself a model request over the whole context, so it saves little there.
- **Minimum context percent** (default `40`): compact only when the context window is at least this full; a small context is cheap to rebuild and not worth summarizing.

## Develop

From `mods/idle-compact` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
