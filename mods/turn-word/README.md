# turn-word

A Claude Code mod that stops the word in the turn's closing line from rotating. Instead of Baked, Brewed, Churned, Cogitated, Cooked, Crunched, Sautéed or Worked, every turn ends with the one word you choose:

```
✻ Worked for 2s · done 12:35 AM
```

The duration and time stay as Claude Code draws them. Pairs with the `spinnerVerbs` setting for a distraction-free transcript.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install turn-word --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install turn-word --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

The word is the plugin's **Turn word** option (default `Worked`); change it in `/config`.

Terminal sessions only: the desktop app draws its own end-of-turn line.

## Develop

From `mods/turn-word` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
