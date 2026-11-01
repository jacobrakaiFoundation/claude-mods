# prefer-builtin-tools

A Claude Code mod that turns back Bash commands whose whole job a built-in tool does better, and tells Claude which tool to use instead. Addresses [#19649](https://github.com/anthropics/claude-code/issues/19649) (Claude reaches for `sed`, `grep` and `cat` where Read, Grep and Write fit).

| Bash command | Claude is told to use |
|---|---|
| `cat FILE`, `head [-n N] FILE`, `tail -n +N FILE`, `sed -n 'N,Mp' FILE` | Read |
| `grep`/`egrep … PATH`, `rg …`, optionally `\| head -n N` | Grep |
| `find [DIR] -name/-iname/-path PATTERN -type f`, optionally `\| head` | Glob |
| `sed -i 's/literal/text/[g]' FILE` | Edit |
| `echo 'text' > FILE`, `cat > FILE <<'EOF' … EOF` | Write |

The call is denied before it runs, and Claude reads:

```
Use the Read tool instead of `cat` in Bash: it reads a file, with offset and limit for a range of lines.
```

Parsing is deliberately conservative: only one simple command is ever turned back. Anything chained (`&&`, `;`), piped into real work (`| wc -l`), using variables, `$(...)`, a `~` path or an unquoted glob, reading stdin or a path under `/dev`, `/proc` or `/sys`, appending (`>>`), a `find` without `-type f` (it finds directories too), a `tail` that counts from the end of the file (`tail FILE`, `tail -n 20 FILE`, `tail -f`; Read cannot start from the end), or passing a flag the Grep, Read or Edit tool has no input for (`grep -v`, `grep -F`, `grep -w`, `--exclude`, `rg -S`, `rg -T`, `rg -U`, `find -exec`, a regex `sed -i`) runs as Bash, untouched.

A rule applies only when the session has the tool it points to: when Grep, Glob, Read, Edit or Write is not in the session's tool list (left out of the build, or disallowed), its commands run as Bash. Only the main conversation's own Bash calls are checked: another plugin's `$.tool.call` of Bash runs untouched, and so does every subagent's, because a hook cannot see which tools a subagent has (one given only Bash would be told to use a tool it lacks).

In bypass-permissions mode the mod stands aside, since that mode's system prompt tells Claude it may read, search and edit through Bash. It learns the mode from the classic `UserPromptSubmit` and `PostToolUse` events, so a switch made mid-turn takes effect after the next tool call. Turn on `enforceInBypass` to keep the rules on in that mode.

One difference stays: the Grep tool skips `.gitignore`d files, which `grep -r` searches, so a match found only in such a file is missed. Turn the `grep` rule off if you rely on that.

Works in terminal and desktop sessions alike, and in `claude -p`: it acts on the tool call, not on anything drawn.

## Install

At the prompt of a Claude Code session:

```
/plugin install prefer-builtin-tools --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install prefer-builtin-tools --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

Each rule is an option of its own in `/config`, all on by default: `read`, `grep`, `glob`, `edit`, `write`. Turn one off to let those commands run as Bash again. `enforceInBypass`, off by default, keeps the rules on in bypass-permissions mode.

## Develop

From `mods/prefer-builtin-tools` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

The classifier is the pure function `classify` in `hooks/classify.ts`; `tests/classify.test.tsx` lists what it turns back and what it leaves alone.

Mods are an early-access Claude Code feature; the API may change between releases.
