# assisted-by

A Claude Code mod that credits Claude in commits with an `Assisted-by` trailer, as the Linux kernel, Fedora and LLVM ask, instead of `Co-Authored-By`. The model name is kept:

```
Fix the flaky login test

Assisted-by: Claude Opus 4.6
```

- The commit trailer and any `Co-Authored-By: Claude ...` line in the PR footer are rewritten; the `🤖 Generated with Claude Code` line is left as it is.
- Only a `Co-Authored-By: Claude ...` line at an `@anthropic.com` address is rewritten; any other co-author stays, a human named Claude included.
- Your `attribution` settings still apply first: with attribution turned off there is nothing to rewrite.

Addresses [#36105](https://github.com/anthropics/claude-code/issues/36105).

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install assisted-by --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load everywhere, including the desktop app's Code tab). Or from a shell:

```bash
claude plugin install assisted-by --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

**Trailer format** (default `Assisted-by: {model}`): the line written in place of Claude's trailer. `{model}` is the name Claude Code wrote (`Claude Opus 4.6`), `{email}` its address (`noreply@anthropic.com`). Change it in `/config` to any one line, for instance `Assisted-by: {model} <{email}>`.

Verified in terminal sessions, where Claude Code composes the attribution itself. A host that injects its own attribution guidance (the desktop app can) is not rewritten by this mod.

## Develop

From `mods/assisted-by` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
