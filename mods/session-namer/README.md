# session-namer

A Claude Code mod that lets Claude name its own session, and names a new session for you after its first answer.

- **`rename_session` tool**: Claude can rename the session, the same as typing `/rename <name>`. Claude is told to use it only when you ask ("name this session after the issue") or the session has no name yet. A name you set (with `claude -n`, a resumed session's name, or a `/rename` you typed) is kept: the tool refuses to replace it unless your latest prompt asks for a new one, which it reads as a naming word (name, rename, title) together with a word for the session (session, conversation, chat, thread). The new name shows when the turn ends, because Claude Code runs slash commands only between turns.
- **Automatic names**: after the first answer, a session with no name gets a short title (2 to 6 words) from a small model, written from your first prompt (slash commands such as `/color` or `/rename` don't count) and that answer. It's skipped if the session already has any name: one from `claude -n`, a resumed session's name, the name `/clear` carries over, a `/rename` you typed, or one Claude set. It runs once per conversation; `/clear`, `/resume` and a fork each start a new conversation, so an unnamed one is titled from its own first prompt.

It addresses:

- [#25045](https://github.com/anthropics/claude-code/issues/25045): let skills rename sessions programmatically
- [#15762](https://github.com/anthropics/claude-code/issues/15762): smart session rename
- [#33165](https://github.com/anthropics/claude-code/issues/33165): let Claude rename its own session
- [#40346](https://github.com/anthropics/claude-code/issues/40346): rename a session from a hook or tool
- [#75733](https://github.com/anthropics/claude-code/issues/75733): give the agent a rename-session tool

Works with [session-style](../session-style): a project name prefix is added to the names this mod sets.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install session-namer --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install session-namer --marketplace jacobrakaiFoundation/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `jacobrakaiFoundation/claude-mods`, then **Add plugin**.

## Configure

In `/config`:

- **Name new sessions** (`autoName`, default on): give an unnamed session a title after its first answer.
- **Title model** (`titleModel`, default `haiku`): the model that writes that title. Each title is one small request.

If the title model is rate-limited, overloaded, has a server error, or doesn't answer in time, it's asked again after 1 second and then 2 seconds (three tries in all). Any other failure, such as an unknown model or an authentication error, is not retried. Either way the session stays unnamed and one line in the transcript says why.

## Surfaces

The tool and the automatic title work in the terminal and in sessions the desktop app runs. Both use the built-in `/rename`, so the name shows wherever Claude Code shows the session's `/rename` name. In a headless run (`claude -p`, or an SDK host with no surface attached) the mod does nothing: Claude isn't offered the tool and no title is written, because the output of `/rename` would end up in the run's result. If an app attaches to such a session later, the tool is offered from then on.

## Develop

From `mods/session-namer` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
