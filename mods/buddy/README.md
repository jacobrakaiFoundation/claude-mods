# buddy

A Claude Code mod that brings back a small companion: a creature that sits above the prompt, in the terminal and the desktop app, and reacts to what Claude is doing.

```
 /\_/\
( o?o )   Pip is thinking…
 > ^ <
```

- **idle** `( o.o )` keeping you company
- **thinking** `( o?o )` while a turn runs
- **pleased** `( ^w^ )` when a turn lands
- **worried** `( O_O )` after any of Claude's own tool calls ends in an error (including a permission you refused and a command that exits non-zero, such as a `grep` with no match), or a turn ends on an error, until the next turn starts; a subagent's tool errors do not count
- **napping** `( -.- )` after 10 minutes with nothing happening

It never toasts, beeps or talks to the model: it only draws. It steps aside while a survey holds the band, shows its face row alone when the band has fewer than three rows, and hides when the band is narrower than the creature.

Addresses [#45596](https://github.com/anthropics/claude-code/issues/45596) and [#45855](https://github.com/anthropics/claude-code/issues/45855) (bring back `/buddy`). It is a fresh companion, not the original: no rarity tiers, collection or `/buddy` command.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install buddy --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab). Or from a shell:

```bash
claude plugin install buddy --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

Two options, changed in `/config`:

- **Buddy's name** (default `Pip`)
- **Species**: `cat` (default), `owl`, `duck`, `ghost` or `blob`

The band above the prompt holds one drawing: with another mod that draws there (such as usage-meter or state-band), only one of them shows.

## Develop

From `mods/buddy` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
