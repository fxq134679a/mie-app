import Foundation
import Capacitor
import WidgetKit

// 桌面小组件桥接插件：JS 侧 window.Capacitor.Plugins.CoupleWidget
//   write({ payload })   payload 是 couple_widget.js 压出来的一段 JSON 快照
//   read()               读回当前快照（调试用）
//   clear()              清空
@objc(CoupleWidgetPlugin)
public class CoupleWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoupleWidgetPlugin"
    public let jsName = "CoupleWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func write(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"),
              let snap = try? JSONDecoder().decode(CoupleSnapshot.self, from: Data(payload.utf8)) else {
            call.reject("小组件数据没解析出来")
            return
        }

        CoupleStore.save(payload)

        // 头像里有需要联网下载的，等它落盘后再刷一次，避免同一秒里刷两遍时间轴
        let remote = [snap.taAvatar, snap.myAvatar].contains { $0.kind == "url" }
        CoupleStore.resolveAvatars(ta: snap.taAvatar, my: snap.myAvatar) {
            if remote { self.reload() }
        }
        if !remote { reload() }
        call.resolve(["ok": true, "updatedAt": snap.updatedAt])
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let s = CoupleStore.defaults.string(forKey: CoupleStore.key) else {
            call.resolve(["snapshot": NSNull()])
            return
        }
        call.resolve(["snapshot": s])
    }

    @objc func clear(_ call: CAPPluginCall) {
        CoupleStore.defaults.removeObject(forKey: CoupleStore.key)
        reload()
        call.resolve()
    }

    private func reload() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
