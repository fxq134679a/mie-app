import Foundation
import Capacitor

// 海绵音乐 HTTP 桥接插件：JS 侧 window.Capacitor.Plugins.HaimianBridge
// 海绵音乐 / 网易云接口不发 CORS 头，WebView 层的 fetch 会被拦；
// 本插件用 URLSession 原生直连，绕开 CORS。
//   request({method, url, headers, bodyB64, timeoutMs})  → {status, bodyText, bodyB64}
//   downloadToFile({method, url, headers, timeoutMs})    → {status, path, size}
//   readChunk({path, offset, length})                    → {b64}   （大文件分块回传，供 JS 拼进度）
//   removeFile({path})                                   → 清理临时文件
//   setBadge({count})                                    → 设置 App 桌面图标未读角标（0 = 清除）
@objc(HaimianBridgePlugin)
public class HaimianBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HaimianBridgePlugin"
    public let jsName = "HaimianBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadToFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise)
    ]

    private func buildRequest(_ call: CAPPluginCall) -> URLRequest? {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = call.getString("method") ?? "GET"
        req.timeoutInterval = TimeInterval(call.getInt("timeoutMs") ?? 30000) / 1000.0
        if let headers = call.getObject("headers") as? [String: Any] {
            for (k, v) in headers {
                if let s = v as? String { req.setValue(s, forHTTPHeaderField: k) }
            }
        }
        if let b64 = call.getString("bodyB64"), !b64.isEmpty, let data = Data(base64Encoded: b64) {
            req.httpBody = data
        }
        return req
    }

    @objc func request(_ call: CAPPluginCall) {
        guard let req = buildRequest(call) else {
            call.reject("参数错误：缺少 url")
            return
        }
        let task = URLSession.shared.dataTask(with: req) { data, resp, err in
            if let err = err {
                call.reject("网络错误：\(err.localizedDescription)")
                return
            }
            guard let http = resp as? HTTPURLResponse else {
                call.reject("无 HTTP 响应")
                return
            }
            let body = data ?? Data()
            DispatchQueue.main.async {
                call.resolve([
                    "status": http.statusCode,
                    "bodyText": String(data: body, encoding: .utf8) ?? "",
                    "bodyB64": body.base64EncodedString()
                ])
            }
        }
        task.resume()
    }

    @objc func downloadToFile(_ call: CAPPluginCall) {
        guard let req = buildRequest(call) else {
            call.reject("参数错误：缺少 url")
            return
        }
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("hm_\(UUID().uuidString).bin")
        let task = URLSession.shared.dataTask(with: req) { data, resp, err in
            if let err = err {
                call.reject("网络错误：\(err.localizedDescription)")
                return
            }
            guard let http = resp as? HTTPURLResponse else {
                call.reject("无 HTTP 响应")
                return
            }
            let body = data ?? Data()
            do {
                try body.write(to: tmp, options: .atomic)
            } catch {
                call.reject("临时文件写入失败：\(error.localizedDescription)")
                return
            }
            DispatchQueue.main.async {
                call.resolve([
                    "status": http.statusCode,
                    "path": tmp.path,
                    "size": body.count
                ])
            }
        }
        task.resume()
    }

    @objc func readChunk(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let off = call.getInt("offset"),
              let len = call.getInt("length") else {
            call.reject("参数错误：需要 path/offset/length")
            return
        }
        guard let fh = FileHandle(forReadingAtPath: path) else {
            call.reject("文件不存在：\(path)")
            return
        }
        defer { try? fh.close() }
        fh.seek(toFileOffset: UInt64(max(0, off)))
        let data = fh.readData(ofLength: max(0, len))
        DispatchQueue.main.async {
            call.resolve(["b64": data.base64EncodedString()])
        }
    }

    @objc func removeFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("参数错误：缺少 path")
            return
        }
        try? FileManager.default.removeItem(atPath: path)
        DispatchQueue.main.async { call.resolve() }
    }

    // 桌面图标未读角标：count = 显示的数字，0 = 清除。
    // 通知权限里含 badge（Capacitor LocalNotifications 申请时已带上），
    // 若用户关了角标权限，系统会静默忽略，这里照样 resolve。
    @objc func setBadge(_ call: CAPPluginCall) {
        let n = max(0, call.getInt("count") ?? 0)
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = n
            call.resolve(["count": n])
        }
    }
}
