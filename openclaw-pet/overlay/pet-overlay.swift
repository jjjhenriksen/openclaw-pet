import AppKit
import WebKit

final class DragSurface: NSView {
  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
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
let panelWidth = max(CGFloat(size), 320)
let panelHeight = max(CGFloat(size), 160)
let panel = NSPanel(contentRect: NSRect(x: x - (panelWidth - CGFloat(size)), y: y, width: panelWidth, height: panelHeight), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
panel.level = NSWindow.Level.floating; panel.collectionBehavior = [NSWindow.CollectionBehavior.canJoinAllSpaces, NSWindow.CollectionBehavior.fullScreenAuxiliary, NSWindow.CollectionBehavior.stationary]
panel.isOpaque = false; panel.backgroundColor = NSColor.clear; panel.hasShadow = false; panel.ignoresMouseEvents = clickThrough
let web = WKWebView(frame: panel.contentView!.bounds); web.setValue(false, forKey: "drawsBackground")
let html = """
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#activity{position:absolute;left:8px;bottom:8px;width:calc(100% - \(size)px - 20px);padding:9px 10px;border-radius:11px;background:rgba(27,29,31,.94);color:#f5f5f5;box-shadow:0 2px 8px rgba(0,0,0,.26)}
#head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;letter-spacing:.01em}button{border:0;background:transparent;color:#b9c5ff;font:inherit;padding:0;cursor:pointer}ul{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:5px}.item{display:flex;align-items:center;gap:6px;font-size:11px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dot{width:6px;height:6px;border-radius:50%;background:#9ca3af;flex:0 0 auto}.active .dot{background:#8ab4ff}.success .dot{background:#65d6a0}.error .dot{background:#f38b8b}.collapsed li:nth-child(n+3){display:none}
canvas{position:absolute;right:0;bottom:0;width:\(size)px;height:\(size)px;image-rendering:pixelated}
</style><section id="activity" aria-live="polite"><div id="head"><span id="status">Ready</span><button id="toggle" aria-expanded="true">Hide</button></div><ul id="events"></ul></section><canvas></canvas><script>
const c=document.querySelector('canvas'),x=c.getContext('2d'),label=document.querySelector('#status'),events=document.querySelector('#events'),panel=document.querySelector('#activity'),toggle=document.querySelector('#toggle'),i=new Image();i.src='http://127.0.0.1:\(port)/spritesheet.webp';
const r={idle:[0,6,[280,110,110,140,140,320]],review:[8,6,[150,150,150,150,150,280]],running:[7,6,[120,120,120,120,120,220]],jumping:[4,5,[140,140,140,140,280]],failed:[5,8,[140,140,140,140,140,140,140,240]],waiting:[6,6,[150,150,150,150,150,260]]};let s={animation:'idle',activityLabel:'Ready'},f=0,n=0,w=0,h=0;
let collapsed=false;toggle.onclick=()=>{collapsed=!collapsed;panel.classList.toggle('collapsed',collapsed);toggle.textContent=collapsed?'Show':'Hide';toggle.setAttribute('aria-expanded',String(!collapsed))};function render(items){events.replaceChildren(...(items||[]).map(item=>{const li=document.createElement('li');li.className='item '+item.tone;const dot=document.createElement('span');dot.className='dot';const text=document.createElement('span');text.textContent=item.label;li.append(dot,text);return li}))}async function p(){try{s=await fetch('http://127.0.0.1:\(port)/state',{cache:'no-store'}).then(q=>q.json());label.textContent=s.activityLabel||'Ready';render(s.activity)}catch{label.textContent='Waiting for OpenClaw'}setTimeout(p,75)}p();
function d(t){let a=r[s.animation]||r.idle;if(t>=n){f=(f+1)%a[1];n=t+a[2][f]}if(i.complete){let cw=c.clientWidth,ch=c.clientHeight;if(w!==cw||h!==ch){w=c.width=cw;h=c.height=ch}x.clearRect(0,0,w,h);x.imageSmoothingEnabled=false;let z=Math.min(w/192,h/208),pw=192*z,ph=208*z;x.drawImage(i,f*192,a[0]*208,192,208,(w-pw)/2,(h-ph)/2,pw,ph)}requestAnimationFrame(d)}requestAnimationFrame(d)
</script>
"""
web.loadHTMLString(html, baseURL: nil)
panel.contentView?.addSubview(web)
let dragSurface = DragSurface(frame: panel.contentView!.bounds)
dragSurface.frame = NSRect(x: panelWidth - CGFloat(size), y: 0, width: CGFloat(size), height: CGFloat(size))
dragSurface.autoresizingMask = [.width, .height]
dragSurface.wantsLayer = true
dragSurface.layer?.backgroundColor = NSColor.clear.cgColor
panel.contentView?.addSubview(dragSurface)
panel.orderFrontRegardless(); NSApplication.shared.setActivationPolicy(.accessory); NSApplication.shared.run()
