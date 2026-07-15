import AppKit
import WebKit

final class DragSurface: NSView {
  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }
}

final class OverlayNavigationDelegate: NSObject, WKNavigationDelegate {
  private let port: Int
  private let resize: (Int, Int, Int, Int) -> Void

  init(port: Int, resize: @escaping (Int, Int, Int, Int) -> Void) {
    self.port = port
    self.resize = resize
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
    if url.scheme == "openclaw-pet" && url.host == "resize" {
      decisionHandler(.cancel)
      let values = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
      let size = values.first(where: { $0.name == "size" }).flatMap { Int($0.value ?? "") }
      let count = values.first(where: { $0.name == "count" }).flatMap { Int($0.value ?? "") }
      let offsetX = values.first(where: { $0.name == "offsetX" }).flatMap { Int($0.value ?? "") } ?? 0
      let offsetY = values.first(where: { $0.name == "offsetY" }).flatMap { Int($0.value ?? "") } ?? 0
      if let size, let count, (96...768).contains(size), (1...16).contains(count) {
        resize(size, count, offsetX, offsetY)
      }
      return
    }
    let isOverlayOrigin = url.scheme == "http" && url.host == "127.0.0.1" && url.port == port
    decisionHandler(isOverlayOrigin ? .allow : .cancel)
  }
}

guard CommandLine.arguments.count >= 4,
      let port = Int(CommandLine.arguments[1]),
      let size = Int(CommandLine.arguments[2]),
      (96...768).contains(size) else { exit(2) }
let corner = CommandLine.arguments[3]
let clickThrough = CommandLine.arguments.count >= 5 && CommandLine.arguments[4] == "true"
let sourceCount = CommandLine.arguments.count >= 6 ? max(1, min(16, Int(CommandLine.arguments[5]) ?? 1)) : 1
let offsetX = CommandLine.arguments.count >= 7 ? Int(CommandLine.arguments[6]) ?? 0 : 0
let offsetY = CommandLine.arguments.count >= 8 ? Int(CommandLine.arguments[7]) ?? 0 : 0
let showStatus = CommandLine.arguments.count < 9 || CommandLine.arguments[8] != "false"
let frame = NSScreen.main?.visibleFrame ?? .zero
let edge: CGFloat = 20
let activityWidth: CGFloat = 220
func overlayDimensions(size: Int, sourceCount: Int) -> (width: CGFloat, height: CGFloat) {
  let petWidth = CGFloat(size * sourceCount)
  return showStatus
    ? (max(petWidth + activityWidth, 320), max(CGFloat(size), 160))
    : (petWidth, CGFloat(size))
}
let initialDimensions = overlayDimensions(size: size, sourceCount: sourceCount)
let panelWidth = initialDimensions.width
let panelHeight = initialDimensions.height
let panelX = (corner.contains("left") ? frame.minX + edge : frame.maxX - panelWidth - edge) + CGFloat(offsetX)
let y = (corner.contains("top") ? frame.maxY - panelHeight - edge : frame.minY + edge) + CGFloat(offsetY)
let panel = NSPanel(contentRect: NSRect(x: panelX, y: y, width: panelWidth, height: panelHeight), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
panel.level = NSWindow.Level.floating; panel.collectionBehavior = [NSWindow.CollectionBehavior.canJoinAllSpaces, NSWindow.CollectionBehavior.fullScreenAuxiliary, NSWindow.CollectionBehavior.stationary]
panel.isOpaque = false; panel.backgroundColor = NSColor.clear; panel.hasShadow = false; panel.ignoresMouseEvents = clickThrough; panel.becomesKeyOnlyIfNeeded = true
let web = WKWebView(frame: panel.contentView!.bounds); web.setValue(false, forKey: "drawsBackground")
web.autoresizingMask = [.width, .height]
var dragSurface: DragSurface?
let navigationDelegate = OverlayNavigationDelegate(port: port) { nextSize, nextCount, nextOffsetX, nextOffsetY in
  let nextDimensions = overlayDimensions(size: nextSize, sourceCount: nextCount)
  let nextWidth = nextDimensions.width
  let nextHeight = nextDimensions.height
  let nextX = (corner.contains("left") ? frame.minX + edge : frame.maxX - nextWidth - edge) + CGFloat(nextOffsetX)
  let nextY = (corner.contains("top") ? frame.maxY - nextHeight - edge : frame.minY + edge) + CGFloat(nextOffsetY)
  panel.setFrame(NSRect(x: nextX, y: nextY, width: nextWidth, height: nextHeight), display: true)
  dragSurface?.frame = NSRect(x: nextWidth - CGFloat(nextSize * nextCount), y: 0, width: CGFloat(nextSize * nextCount), height: CGFloat(max(1, nextSize - 38)))
}
web.navigationDelegate = navigationDelegate
web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/")!))
panel.contentView?.addSubview(web)
if !clickThrough {
  let surface = DragSurface(frame: NSRect(x: panelWidth - CGFloat(size * sourceCount), y: 0, width: CGFloat(size * sourceCount), height: CGFloat(max(1, size - 38))))
  surface.autoresizingMask = []
  surface.wantsLayer = true
  surface.layer?.backgroundColor = NSColor.clear.cgColor
  panel.contentView?.addSubview(surface)
  dragSurface = surface
}
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()
