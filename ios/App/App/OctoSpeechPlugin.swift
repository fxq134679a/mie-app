import Foundation
import Capacitor
import Speech
import AVFoundation

// 本地语音识别插件：JS 侧 window.Capacitor.Plugins.OctoSpeech
// IPA 的 WKWebView 里没有 Web Speech API（webkitSpeechRecognition），Safari 才有；
// 本插件用系统的 SFSpeechRecognizer 做真·本地识别（支持的机型/语言走离线模型），
// 不经过任何第三方 API，免费。
//   check()                → { available, onDeviceSupported }
//   start({lang})          → 开始监听；权限（语音识别+麦克风）首次会弹系统授权
//   stop()                 → 软结束（finish），最后一次 final 结果会自然送达
// 事件（JS 用 addListener 收）：
//   result  {text, isFinal}   text 为本会话累计全文；isFinal 时为最终结果
//   error   {message}         识别链路挂了，JS 侧自行降级
@objc(OctoSpeechPlugin)
public class OctoSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OctoSpeechPlugin"
    public let jsName = "OctoSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var recognizer: SFSpeechRecognizer?
    private var bufferRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recTask: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()
    private var running = false

    // MARK: - JS 接口

    @objc func check(_ call: CAPPluginCall) {
        let locale = Locale(identifier: "zh-CN")
        let rec = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
        call.resolve([
            "available": rec?.isAvailable ?? false,
            "onDeviceSupported": rec?.supportsOnDeviceRecognition ?? false,
            "permission": SFSpeechRecognizer.authorizationStatus().rawValue
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        let lang = call.getString("lang") ?? "zh-CN"
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in
            guard auth == .authorized else {
                call.reject("语音识别权限被拒绝（iOS 设置 → 隐私与安全性 → 语音识别与听写）")
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
                guard granted else {
                    call.reject("麦克风权限被拒绝（iOS 设置 → 隐私与安全性 → 麦克风）")
                    return
                }
                DispatchQueue.main.async {
                    self?.begin(lang: lang, call: call)
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        // 软结束：finish 让识别器把最后一段收尾成 final；引擎再停
        bufferRequest?.endAudio()
        recTask?.finish()
        teardownEngine()
        call.resolve()
    }

    // MARK: - 内部

    private func begin(lang: String, call: CAPPluginCall) {
        stopInternal()

        let locale = Locale(identifier: lang)
        let rec = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
        guard let rec = rec, rec.isAvailable else {
            call.reject("当前设备/语言不支持语音识别")
            return
        }
        recognizer = rec

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("音频会话启动失败: \(error.localizedDescription)")
            return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if rec.supportsOnDeviceRecognition {
            // 支持离线识别就强制本地，完全不联网
            req.requiresOnDeviceRecognition = true
        }
        bufferRequest = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            req.append(buffer)
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            call.reject("麦克风引擎启动失败: \(error.localizedDescription)")
            return
        }
        running = true

        recTask = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                self.notifyListeners("result", data: [
                    "text": text,
                    "isFinal": result.isFinal
                ])
            }
            if let error = error {
                // 用户 stop 触发的 finish 不算错误；engine 被系统打断才上报
                let nsErr = error as NSError
                if nsErr.domain == "kAFAssistantErrorDomain" && nsErr.code == 1110 { return } // 1110 = 用户取消/结束
                if self.running {
                    self.running = false
                    self.notifyListeners("error", data: ["message": error.localizedDescription])
                }
            }
        }

        call.resolve([
            "ok": true,
            "onDevice": rec.supportsOnDeviceRecognition
        ])
    }

    private func teardownEngine() {
        if running {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            running = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func stopInternal() {
        bufferRequest?.endAudio()
        recTask?.cancel()
        recTask = nil
        bufferRequest = nil
        teardownEngine()
    }
}
