# session-style

A Claude Code mod that gives every session in a project the same look. When a session starts, it sets the prompt bar color (`/color`) and puts a name prefix in front of the session name (`/rename`), so you can tell the sessions of different projects apart.

Put the style in your repository, at `.claude/session-style.json` in its top-level folder (the one holding `.git`). A session started in a subfolder uses the nearest such file between that subfolder and the top. Outside a git repository, the file is read only from the folder Claude starts in.

```json
{ "color": "purple", "namePrefix": "[api]" }
```

- **`color`**: one of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (the colors `/color` takes).
- **`namePrefix`**: up to 40 characters, on one line. A new session is named `[api]`. A resumed or `claude -n` session keeps its name with the prefix added in front (`[api] billing refactor`). Every later `/rename fix login` becomes `[api] fix login`, including renames made by other mods such as [session-namer](../session-namer).

Both fields are optional; any other keys are ignored. If the file is broken (not JSON, an unknown color, a bad prefix), a line in the transcript names the file and the field, and nothing is applied until you fix it. It doesn't fall back to the defaults.

The style is applied once per conversation, when the session starts, and again after `/clear` (the color is set again; the name `/clear` carries over keeps its prefix). Reloading the mod (changing an option in `/config`) does not apply it again, so a name you gave the session since it started stays; a changed file or option takes effect in the next session or after `/clear`.

It addresses:

- [#36928](https://github.com/anthropics/claude-code/issues/36928): add a persistent session color setting
- [#34121](https://github.com/anthropics/claude-code/issues/34121): persist the prompt color across sessions
- [#58588](https://github.com/anthropics/claude-code/issues/58588): set `/rename` and `/color` automatically at session start
- [#96309](https://github.com/anthropics/claude-code/issues/96309): project-scoped session name prefix and color

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install session-style --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install session-style --marketplace jacobrakaiFoundation/claude-mods
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `jacobrakaiFoundation/claude-mods`, then **Add plugin**.

## Configure

Defaults for projects that have no `.claude/session-style.json`, set in `/config`:

- **Default color** (`color`, default `none`): `none` leaves the color alone.
- **Default name prefix** (`namePrefix`, default empty): empty means no prefix.

A project file overrides these field by field.

## Surfaces

Made for the terminal, where `/color` paints the prompt bar and the name shows on the session. It uses the built-in `/color` and `/rename`, so in sessions the desktop app runs, the name and color show wherever the app shows those.

## Develop

From `mods/session-style` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
