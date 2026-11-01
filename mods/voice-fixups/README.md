# voice-fixups

A Claude Code mod that fixes what dictation gets wrong. You list spoken phrases and what you meant; each prompt has them replaced before it enters the session:

```
run cube cuttle get pods and update claude dot md
→ run kubectl get pods and update CLAUDE.md
```

Phrases match whole words in any case, with any spacing between words (`Cube  Cuttle` matches, `cube cuttles` does not). Where phrases overlap, the one that starts first wins, and of those starting at the same word the longest; a replacement is never replaced again.

Addresses the replacements half of [#31599](https://github.com/anthropics/claude-code/issues/31599). The custom-dictionary half (hinting the speech recognizer) is out of reach of a mod: it only sees the text after recognition.

Claude Code does not tell a mod whether a prompt was dictated or typed, so the replacements apply to every prompt you write: typed or dictated in the terminal or the desktop app, sent over Remote Control, or passed to `claude -p`. Pick phrases you would not type on purpose. Slash commands and messages from other sessions, schedules or plugins are left alone.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install voice-fixups --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install voice-fixups --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

Replacements come from three places; a later one wins on the same phrase:

1. **Replacements** in `/config`, one per entry as `spoken => written` (`cube cuttle => kubectl`).
2. `~/.claude/voice-fixups.json`, for every project.
3. `.claude/voice-fixups.json` in the session's project root (where it started, or where `/cd` moved it), for this project.

Each file is one JSON object of spoken phrase to written text:

```json
{
  "cube cuttle": "kubectl",
  "claude dot md": "CLAUDE.md",
  "type script": "TypeScript"
}
```

The files are read on every prompt, so edits apply at once. A file that is not valid JSON, is not one object, or maps a phrase to something other than a string is reported in a dim transcript line with its path and the fault, and that prompt enters without replacements. A `/config` entry that does not read `spoken => written` stops the mod from loading, and the error names the entry.

## Develop

From `mods/voice-fixups` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
