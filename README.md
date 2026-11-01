# claude-mods

Free, open-source add-ons for Claude Code and the Claude desktop app from the Jacobrakai Foundation. Each one fills a gap people asked for in [anthropics/claude-code](https://github.com/anthropics/claude-code/issues).

## Mods

Claude Code plugins. Install one from the prompt of a terminal Claude Code session (answer `y` to add the marketplace, then pick a scope):

```
/plugin install <mod> --marketplace jacobrakaiFoundation/claude-mods
```

| Mod | What it does |
|---|---|
| [assisted-by](mods/assisted-by) | Writes Claude's commit and PR attribution as an Assisted-by trailer instead of Co-Authored-By, keeping the model name |
| [buddy](mods/buddy) | A small companion above the prompt that thinks while Claude works, cheers when a turn lands, frets at a tool error and naps when left alone |
| [compact-diffs](mods/compact-diffs) | Draws one dim line ("Edited src/foo.ts (+3 -1)") in place of the inline diff under Edit and Write results; ctrl+o still shows the diff |
| [compact-tool](mods/compact-tool) | Gives Claude a compact tool, so an automated workflow can compact the conversation at a natural boundary (optionally only past a context threshold) and carry on |
| [effort-router](mods/effort-router) | Sets a turn's reasoning effort from an inline !low / !medium / !high / !xhigh / !max token or from keyword rules, and strips the token from the prompt |
| [idle-compact](mods/idle-compact) | Compacts the conversation after a stretch of idle minutes, before the prompt cache expires, so the next prompt does not pay to rebuild it |
| [idle-notify](mods/idle-notify) | Sends a desktop notification, and optionally a chime, when Claude has been waiting for you for a delay you choose |
| [latex-unicode](mods/latex-unicode) | Draws the LaTeX math in Claude's replies ($...$ and $$...$$) as Unicode in the terminal: α, x², a/b, √x, ∑, ≤ |
| [no-auto-plan](mods/no-auto-plan) | Stops Claude from entering plan mode on its own; you can still enter it with shift+tab |
| [prefer-builtin-tools](mods/prefer-builtin-tools) | Turns back simple Bash commands (cat, head, tail, grep, rg, find, sed -i, echo > file) whose job Read, Grep, Glob, Edit or Write does better, naming the tool to use |
| [prompt-queue](mods/prompt-queue) | A /queue command: line up prompts that run one after another, each once the turn before it finishes |
| [session-namer](mods/session-namer) | Lets Claude rename its own session with a rename_session tool, and names an unnamed session after its first answer |
| [session-style](mods/session-style) | Gives every session in a project the same prompt color and name prefix, from .claude/session-style.json or your defaults |
| [skill-blocklist](mods/skill-blocklist) | Disables individual skills, plugin skills included: hidden from the model's skill listing and the typeahead, refused at the Skill tool, and never loaded |
| [skill-status](mods/skill-status) | Shows the skill the current turn is running in the status line under the prompt, cleared when the turn ends |
| [state-band](mods/state-band) | One line above the prompt that says whether Claude is working, waiting on you, done (and when), or stopped on an error |
| [timestamps](mods/timestamps) | Shows the local time (HH:MM:SS) each user and assistant message was added, beside it in the transcript |
| [tool-group-names](mods/tool-group-names) | Names the files and patterns under folded tool lines like "Read 3 files" |
| [turn-word](mods/turn-word) | Replaces the rotating word in the turn's closing line (Baked, Brewed, Cogitated...) with one fixed word |
| [usage-meter](mods/usage-meter) | A band above the prompt showing context fill, 5-hour and 7-day rate limits, and session cost |
| [voice-fixups](mods/voice-fixups) | Custom vocabulary for dictated prompts: replaces spoken phrases ("cube cuttle") with what you meant ("kubectl"), whole words, any case |

Each mod's README says which surfaces it works on (terminal, desktop app) and links the issue it addresses. Mods are an early-access Claude Code feature; the API may change between releases.

## Apps

Small helpers for the Claude desktop app, built from source.

| App | What it does | Platforms |
|---|---|---|
| [ClaudePinchZoom](apps/ClaudePinchZoom) | Trackpad pinch-to-zoom | macOS; Windows beta |
| [ClaudeEnterKey](apps/ClaudeEnterKey) | Return for newline, ⌘ Return to send | macOS |

## Develop

Each mod checks with `claude plugin validate .` and `claude plugin test .` from its folder. Apps build with Xcode (macOS) or Go (Windows); see each README.

## License

MIT
