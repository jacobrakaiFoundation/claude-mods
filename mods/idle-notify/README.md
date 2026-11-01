# idle-notify

A Claude Code mod that taps you on the shoulder when Claude has been waiting for you, after a delay you choose instead of the built-in 60 seconds:

- A turn ends (answered, refused or stopped on an error): after the delay, a notification says **Claude is waiting for your input**.
- Claude asks you a question (`AskUserQuestion`): after the delay with the question still open, **Claude asked you a question**.
- Typing in the prompt box, recalling history, undoing, sending a prompt or a new turn starting cancels the wait. A turn you interrupted, and a subagent finishing, start none.
- Optionally a short chime plays once the notification is sent (macOS).

The notification goes through your own notification channel (the `preferredNotifChannel` setting: iTerm2, Kitty, Ghostty or the terminal bell). If your terminal has none, a line under the prompt says so. With notifications turned off in your settings, nothing is sent.

Addresses [#13922](https://github.com/anthropics/claude-code/issues/13922). Claude Code's own idle notification still fires at 60 seconds alongside this one.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install idle-notify --marketplace jacobrakaiFoundation/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```bash
claude plugin install idle-notify --marketplace jacobrakaiFoundation/claude-mods
```

## Configure

In `/config`:

- **Delay (seconds)** (default `60`): how long Claude waits for you before the notification. Any positive number, `15` for instance.
- **Play a chime** (default off): play a short chime with the notification. macOS only; Linux and Windows play nothing.

Terminal sessions only: the desktop app sends its own notifications, and a mod's notification has no terminal to go to there.

## Develop

From `mods/idle-notify` in a clone of the repo:

```bash
claude plugin validate .
claude plugin test .
```

Mods are an early-access Claude Code feature; the API may change between releases.
