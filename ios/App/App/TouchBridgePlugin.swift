import Foundation
import UIKit
import Capacitor

// 触感空间 · 原生震动桥插件：JS 侧 window.Capacitor.Plugins.TouchBridge
// iOS 的 WKWebView 不支持网页震动（navigator.vibrate 不存在），
// touch_space.js 检测到本插件时会用 navigator.vibrate = ... 打补丁，
// touch-surface.js 的 buzz(毫秒数) 就会走到这里。
//   vibrate({duration})  → 用 UIImpactFeedbackGenerator 按强度触发一次触感
// 时长映射强度：touch-surface 按下 buzz(8+25*p)、滑动 buzz(5+15*p)，
// 5~33ms 的时长被映射成 0.3~1.0 的 impact 强度。
@objc(TouchBridgePlugin)
public class TouchBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TouchBridgePlugin"
    public let jsName = "TouchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "vibrate", returnType: CAPPluginReturnPromise)
    ]

    private let generator = UIImpactFeedbackGenerator(style: .light)

    // 画中画保活：网页端（keep_alive.js「画中画」模式）要进 PiP 小窗，
    // WKWebView 默认关着 allowsPictureInPicturePlayback，这里在壳内放开。
    // 本插件 load 得早、又总在工程里，借它的生命周期顺手配置 WebView。
    override public func load() {
        DispatchQueue.main.async { [weak self] in
            guard let wv = self?.webView else { return }
            wv.configuration.allowsPictureInPicturePlayback = true
            wv.configuration.mediaTypesRequiringUserActionForPlayback = []
        }
    }

    @objc func vibrate(_ call: CAPPluginCall) {
        let ms = call.getInt("duration") ?? 10
        // 时长 → 强度：5ms≈0.3（轻抚），33ms≈1.0（按实）
        let clamped = Double(max(4, min(33, ms)))
        let intensity = 0.3 + (clamped - 4) / 29.0 * 0.7
        DispatchQueue.main.async { [generator] in
            generator.impactOccurred(intensity: CGFloat(min(1.0, max(0.3, intensity))))
            call.resolve()
        }
    }
}
