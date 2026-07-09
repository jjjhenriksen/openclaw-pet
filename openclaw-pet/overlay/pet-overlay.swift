import AppKit
import WebKit

final class DragSurface: NSView {
  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }
}

final class OverlayNavigationDelegate: NSObject, WKNavigationDelegate {
  private let port: Int

  init(port: Int) {
    self.port = port
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if url.scheme == "openclaw-pet" && url.host == "watchdog-expired" {
      decisionHandler(.cancel)
      NSApplication.shared.terminate(nil)
      return
    }
    let isOverlayOrigin = url.scheme == "http" && url.host == "127.0.0.1" && url.port == port
    decisionHandler(isOverlayOrigin ? .allow : .cancel)
  }
}

guard CommandLine.arguments.count >= 4,
      let port = Int(CommandLine.arguments[1]),
      let size = Int(CommandLine.arguments[2]) else { exit(2) }
let corner = CommandLine.arguments[3]
let clickThrough = CommandLine.arguments.count >= 5 && CommandLine.arguments[4] == "true"
let frame = NSScreen.main?.visibleFrame ?? .zero
let edge: CGFloat = 20
let x = corner.contains("left") ? frame.minX + edge : frame.maxX - CGFloat(size) - edge
let y = corner.contains("top") ? frame.maxY - CGFloat(size) - edge : frame.minY + edge
let panelWidth = max(CGFloat(size) + 96, 320)
let panelHeight = max(CGFloat(size), 160)
let panelX = corner.contains("left") ? x : x - (panelWidth - CGFloat(size))
let panel = NSPanel(contentRect: NSRect(x: panelX, y: y, width: panelWidth, height: panelHeight), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
panel.level = NSWindow.Level.floating; panel.collectionBehavior = [NSWindow.CollectionBehavior.canJoinAllSpaces, NSWindow.CollectionBehavior.fullScreenAuxiliary, NSWindow.CollectionBehavior.stationary]
panel.isOpaque = false; panel.backgroundColor = NSColor.clear; panel.hasShadow = false; panel.ignoresMouseEvents = clickThrough
let web = WKWebView(frame: panel.contentView!.bounds); web.setValue(false, forKey: "drawsBackground")
web.autoresizingMask = [.width, .height]
let navigationDelegate = OverlayNavigationDelegate(port: port)
web.navigationDelegate = navigationDelegate
web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/")!))
panel.contentView?.addSubview(web)
let dragSurface = DragSurface(frame: panel.contentView!.bounds)
dragSurface.frame = NSRect(x: panelWidth - CGFloat(size), y: 0, width: CGFloat(size), height: CGFloat(size))
dragSurface.autoresizingMask = [.width, .height]
dragSurface.wantsLayer = true
dragSurface.layer?.backgroundColor = NSColor.clear.cgColor
panel.contentView?.addSubview(dragSurface)
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()
