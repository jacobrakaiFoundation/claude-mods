# Claude Enter Key

Return for newlines, ⌘ Return to send, in the Claude desktop app's message box on macOS.

| You press | Claude gets |
|---|---|
| Return | newline |
| ⌘ Return | send |
| ⌘⇧ Return | queue (Claude's own ⌘ Return while it's working) |
| ⇧ Return | newline (unchanged) |

A tiny menu-bar helper rewrites the modifier keys of Return presses only while Claude is the front app **and** its message box (the ProseMirror "Prompt" field) has focus. Other fields, dialogs and apps are untouched.

## Install

Requires macOS 14+ and Xcode.

```bash
git clone https://github.com/jacobrakaiFoundation/claude-mods.git
cd claude-mods/apps/ClaudeEnterKey
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ClaudeEnterKey.xcodeproj -scheme ClaudeEnterKey -configuration Release -derivedDataPath build build
cp -R build/Build/Products/Release/ClaudeEnterKey.app ~/Applications/
open ~/Applications/ClaudeEnterKey.app
```

Grant **Accessibility** in System Settings → Privacy & Security → Accessibility, then open the app again. A ⏎ icon appears in the menu bar (Quit is there). Add it to Login Items to start it automatically.

The default build is ad-hoc signed, so macOS forgets the Accessibility approval after each rebuild; reset it with `tccutil reset Accessibility org.jacobrakai.ClaudeEnterKey`, or add `CODE_SIGN_IDENTITY="Apple Development"` to the build command so the approval sticks.

## Notes

- To find the message box it turns on Claude's accessibility tree (`AXManualAccessibility`), as screen readers do.
- Not tested with input methods that use Return to confirm text (Japanese, Chinese).
- If Claude renames or restructures its message box, the helper stops matching it and Return behaves normally again.

The Xcode project is generated from `project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen).
