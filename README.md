# claude-mods

Free, open-source add-ons for Claude Code and the Claude desktop app from the Jacobrakai Foundation. Each one fills a gap people asked for in [anthropics/claude-code](https://github.com/anthropics/claude-code/issues).

## Mods

Claude Code plugins. Install from the prompt of a terminal Claude Code session; answer `y` to add the marketplace, then pick a scope.

| Mod | What it does | Install |
|---|---|---|
| [usage-meter](mods/usage-meter) | Context, 5h/7d rate-limit and cost meters above the prompt (terminal and desktop app) | `/plugin install usage-meter --marketplace jacobrakaiFoundation/claude-mods` |
| [tool-group-names](mods/tool-group-names) | Names the files behind folded lines like "Read 3 files" (terminal) | `/plugin install tool-group-names --marketplace jacobrakaiFoundation/claude-mods` |
| [turn-word](mods/turn-word) | One fixed word in the turn's closing line, "Worked for 3s" (terminal) | `/plugin install turn-word --marketplace jacobrakaiFoundation/claude-mods` |

Mods are an early-access Claude Code feature; the API may change between releases.

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
