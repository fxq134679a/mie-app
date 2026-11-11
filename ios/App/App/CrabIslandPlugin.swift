import Foundation
import Capacitor
import ActivityKit

// 灵动岛桥接插件：JS 侧 window.Capacitor.Plugins.CrabIsland
//   start({ key, title, detail, accent })  开一条实时活动（会先关掉旧的）
//   stop()                                  关掉
//   isRunning()                             查询
@objc(CrabIslandPlugin)
public class CrabIslandPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CrabIslandPlugin"
    public let jsName = "CrabIsland"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isRunning", returnType: CAPPluginReturnPromise)
    ]

    @objc func isRunning(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["running": !Activity<CrabActivityAttributes>.activities.isEmpty])
        } else {
            call.resolve(["running": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("灵动岛需要 iOS 16.2 以上")
            return
        }
        let key = call.getString("key") ?? "fish"
        let title = call.getString("title") ?? "灵动岛"
        let detail = call.getString("detail") ?? ""
        let accent = UInt32(call.getInt("accent") ?? 0x7FD1E8)

        if !ActivityAuthorizationInfo().areActivitiesEnabled {
            call.reject("系统设置里「实时活动」被关掉了：设置 → 面容ID与密码（或通知）→ 实时活动")
            return
        }

        let attributes = CrabActivityAttributes(key: key, title: title, detail: detail, accent: accent)
        let state = CrabActivityAttributes.ContentState(since: Date())

        // 同一时间只留一条：先把旧的都关了
        let old = Activity<CrabActivityAttributes>.activities
        for a in old {
            Task { await a.end(state, dismissalPolicy: .immediate) }
        }

        do {
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(11 * 3600))
            _ = try Activity<CrabActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            call.resolve()
        } catch {
            call.reject("实时活动启动失败：\(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        for a in Activity<CrabActivityAttributes>.activities {
            Task { await a.end(dismissalPolicy: .immediate) }
        }
        call.resolve()
    }
}
