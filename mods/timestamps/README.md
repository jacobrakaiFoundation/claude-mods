# timestamps

A Claude Code mod that shows when each message was sent: the local time sits at the right edge of every prompt and every block of Claude's reply, on the message's last line:

```
> check worker status                                        09:15:32

⏺ Both workers are active...                                 09:15:34
```

- The time is when the message was added to the conversation: for a prompt, when Claude Code took it in (a prompt typed while Claude is busy gets the time it was taken from the queue, not when you pressed Enter), and for the reply, when each block finished arriving.
- 24-hour (`14:05:09`) or 12-hour (`2:05:09 PM`) clock.
- Messages from before the mod was loaded (earlier in a resumed session, or before you installed it) and a reply still streaming show no time. Times are kept for the session, not on disk, so a resumed session shows none for its earlier messages.
- The stored conversation and what Claude reads are untouched: the time is drawn, never added to the text.

Addresses [#44763](https://github.com/anthropics/claude-code/issues/44763) and [#30745](https://github.com/anthropics/claude-code/issues/30745).

Works in the terminal and the desktop app's Code tab (both draw message rows through the same hook).

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install timestamps --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install timestamps --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

The plugin's **Clock** option picks `24h` (default) or `12h`; change it in `/config`.

## Develop

From `mods/timestamps` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
