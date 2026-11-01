import AppKit
import ApplicationServices
import os

/// In Claude desktop's message box, makes Return insert a newline and Cmd+Return send,
/// by rewriting the modifier flags of Return key events before Claude sees them:
///   Return            -> Shift+Return     (newline)
///   Cmd+Return        -> Return           (send)
///   Cmd+Shift+Return  -> Cmd+Return       (queue while Claude is working)
/// Every other key, field and app is left alone.

let claudeBundleID = "com.anthropic.claudefordesktop"
/// The composer is a ProseMirror editor exposed as an AXTextArea.
let composerRole = kAXTextAreaRole as String
let composerDOMClass = "ProseMirror"
let returnKeyCodes: Set<Int64> = [36, 76] // Return, keypad Enter
let log = Logger(subsystem: "org.jacobrakai.ClaudeEnterKey", category: "enter")

/// Pure: the modifier flags to send for a Return press with `flags`, or nil to leave it alone.
func remappedFlags(_ flags: CGEventFlags) -> CGEventFlags? {
    let relevant: CGEventFlags = [.maskCommand, .maskShift, .maskAlternate, .maskControl]
    switch flags.intersection(relevant) {
    case []: return flags.union(.maskShift)
    case [.maskCommand]: return flags.subtracting(.maskCommand)
    case [.maskCommand, .maskShift]: return flags.subtracting(.maskShift)
    default: return nil
    }
}

func claudeApp() -> NSRunningApplication? {
    guard let front = NSWorkspace.shared.frontmostApplication, front.bundleIdentifier == claudeBundleID else { return nil }
    return front
}

/// Electron builds its accessibility tree only once asked; without it the composer can't be seen.
func enableAccessibilityTree(pid: pid_t) {
    let result = AXUIElementSetAttributeValue(AXUIElementCreateApplication(pid), "AXManualAccessibility" as CFString, kCFBooleanTrue)
    if result != .success {
        log.error("AXManualAccessibility failed pid=\(pid, privacy: .public) error=\(result.rawValue, privacy: .public)")
    }
}

func copyAttribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func composerIsFocused(pid: pid_t) -> Bool {
    guard let focused = copyAttribute(AXUIElementCreateApplication(pid), kAXFocusedUIElementAttribute as String),
          CFGetTypeID(focused) == AXUIElementGetTypeID() else { return false }
    let element = focused as! AXUIElement
    guard copyAttribute(element, kAXRoleAttribute as String) as? String == composerRole else { return false }
    let classes = copyAttribute(element, "AXDOMClassList") as? [String] ?? []
    return classes.contains(composerDOMClass)
}

/// Key codes whose key-down was remapped, so the matching key-up gets the same flags.
nonisolated(unsafe) var remappedKeyUps: [Int64: CGEventFlags] = [:]
nonisolated(unsafe) var eventTap: CFMachPort?

let tapCallback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        log.warning("event tap disabled type=\(type.rawValue, privacy: .public); re-enabling")
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    guard returnKeyCodes.contains(keyCode) else { return Unmanaged.passUnretained(event) }

    if type == .keyUp {
        if let flags = remappedKeyUps.removeValue(forKey: keyCode) { event.flags = flags }
        return Unmanaged.passUnretained(event)
    }
    guard let app = claudeApp(), let flags = remappedFlags(event.flags), composerIsFocused(pid: app.processIdentifier) else {
        return Unmanaged.passUnretained(event)
    }
    event.flags = flags
    if event.getIntegerValueField(.keyboardEventAutorepeat) == 0 { remappedKeyUps[keyCode] = flags }
    return Unmanaged.passUnretained(event)
}

func requireAccessibility() {
    let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
    let trusted = AXIsProcessTrustedWithOptions(options)
    log.notice("accessibility trusted=\(trusted, privacy: .public)")
    guard trusted else {
        let alert = NSAlert()
        alert.messageText = "Claude Enter Key needs Accessibility access"
        alert.informativeText = "Enable it in System Settings → Privacy & Security → Accessibility, then relaunch."
        alert.runModal()
        exit(1)
    }
}

func installEventTap() -> CFMachPort {
    let mask = CGEventMask(1 << CGEventType.keyDown.rawValue) | CGEventMask(1 << CGEventType.keyUp.rawValue)
    guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                                      options: .defaultTap, eventsOfInterest: mask,
                                      callback: tapCallback, userInfo: nil) else {
        fatalError("CGEvent.tapCreate failed: grant Accessibility to ClaudeEnterKey")
    }
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    return tap
}

/// Turns the accessibility tree on for Claude now and whenever it is launched or brought to front.
func watchClaude() {
    NSRunningApplication.runningApplications(withBundleIdentifier: claudeBundleID).forEach { enableAccessibilityTree(pid: $0.processIdentifier) }
    let center = NSWorkspace.shared.notificationCenter
    for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didActivateApplicationNotification] {
        center.addObserver(forName: name, object: nil, queue: .main) { note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == claudeBundleID else { return }
            enableAccessibilityTree(pid: app.processIdentifier)
        }
    }
}

final class StatusItemController: NSObject {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

    func install() {
        item.button?.image = NSImage(systemSymbolName: "return", accessibilityDescription: "Claude Enter Key")
        let menu = NSMenu()
        menu.addItem(withTitle: "Return: newline · ⌘Return: send · ⌘⇧Return: queue", action: nil, keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
requireAccessibility()
watchClaude()
eventTap = installEventTap()
let statusController = StatusItemController()
statusController.install()
log.notice("event tap installed")
app.run()
