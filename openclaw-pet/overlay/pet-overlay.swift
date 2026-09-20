import AppKit
import Foundation
import WebKit

final class DragSurface: NSView {
  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }
}

final class OverlayNavigationDelegate: NSObject, WKNavigationDelegate {
  private let port: Int
  private let resize: (Int, Int, Int, Int) -> Void
  private let setPetsHidden: (Bool) -> Void
  private let openRun: (String) -> Void

  init(port: Int, resize: @escaping (Int, Int, Int, Int) -> Void, setPetsHidden: @escaping (Bool) -> Void, openRun: @escaping (String) -> Void) {
    self.port = port
    self.resize = resize
    self.setPetsHidden = setPetsHidden
    self.openRun = openRun
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
    if url.scheme == "openclaw-pet" && url.host == "pets-hidden" {
      decisionHandler(.cancel)
      let hidden = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "hidden" }).flatMap { Bool($0.value ?? "") } ?? false
      setPetsHidden(hidden)
      return
    }
    if url.scheme == "openclaw-pet" && url.host == "open-run" {
      decisionHandler(.cancel)
      let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value ?? ""
      if id.range(of: #"^run_[a-f0-9]{20}$"#, options: .regularExpression) != nil {
        openRun(id)
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
let activityWidth: CGFloat = 320
let activityHeight: CGFloat = 220
let dragButtonReserve: CGFloat = 80
func overlayDimensions(size: Int, sourceCount: Int) -> (width: CGFloat, height: CGFloat) {
  let petWidth = CGFloat(size * sourceCount)
  return showStatus
    ? (max(petWidth, activityWidth), CGFloat(size) + activityHeight)
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
// Keep vector creature images crisp on Retina displays. Without an explicit
// layer scale, WebKit can rasterize the transparent page at 1x and AppKit
// enlarges that bitmap into the 2x overlay window.
web.wantsLayer = true
web.layer?.contentsScale = NSScreen.main?.backingScaleFactor ?? 1.0
web.autoresizingMask = [.width, .height]
var dragSurface: DragSurface?
var petsHidden = false
let openRun: (String) -> Void = { id in
  guard let endpoint = URL(string: "http://127.0.0.1:\(port)/open-run?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)") else { return }
  URLSession.shared.dataTask(with: endpoint) { data, response, _ in
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
          let data,
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let rawUrl = payload["url"] as? String,
          let url = URL(string: rawUrl),
          ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return }
    DispatchQueue.main.async { NSWorkspace.shared.open(url) }
  }.resume()
}
let navigationDelegate = OverlayNavigationDelegate(port: port, resize: { nextSize, nextCount, nextOffsetX, nextOffsetY in
  let nextDimensions = overlayDimensions(size: nextSize, sourceCount: nextCount)
  let nextWidth = nextDimensions.width
  let nextHeight = nextDimensions.height
  let nextX = (corner.contains("left") ? frame.minX + edge : frame.maxX - nextWidth - edge) + CGFloat(nextOffsetX)
  let nextY = (corner.contains("top") ? frame.maxY - nextHeight - edge : frame.minY + edge) + CGFloat(nextOffsetY)
  panel.setFrame(NSRect(x: nextX, y: nextY, width: nextWidth, height: nextHeight), display: true)
  dragSurface?.frame = petsHidden
    ? NSRect(x: 0, y: CGFloat(nextSize), width: max(1, nextWidth - dragButtonReserve), height: activityHeight)
    : NSRect(x: nextWidth - CGFloat(nextSize * nextCount), y: 0, width: CGFloat(nextSize * nextCount), height: CGFloat(max(1, nextSize - 38)))
}, setPetsHidden: { hidden in
  petsHidden = hidden
  dragSurface?.frame = hidden
    ? NSRect(x: 0, y: CGFloat(size), width: max(1, panelWidth - dragButtonReserve), height: activityHeight)
    : NSRect(x: panelWidth - CGFloat(size * sourceCount), y: 0, width: CGFloat(size * sourceCount), height: CGFloat(max(1, size - 38)))
}, openRun: openRun)
web.navigationDelegate = navigationDelegate
web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/")!))
panel.contentView?.addSubview(web)
if !clickThrough {
  let surface = DragSurface(frame: NSRect(x: panelWidth - CGFloat(size * sourceCount), y: 0, width: CGFloat(size * sourceCount), height: CGFloat(max(1, size - 38))))
  surface.autoresizingMask = []
  surface.wantsLayer = true
  surface.layer?.backgroundColor = NSColor.clear.cgColor
  surface.isHidden = petsHidden
  panel.contentView?.addSubview(surface)
  dragSurface = surface
}
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()
