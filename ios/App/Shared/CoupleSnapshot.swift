import Foundation
import UIKit

/* 桌面小组件的数据搬运层。
   网页侧（couple_widget.js）把一整天排好的文案 + 起点 + 两张头像压成一段 JSON 递过来，
   这里落进 App Group，小组件扩展再读出来。没有 App Group 时退到各自沙盒，
   小组件读不到数据就显示占位，不会崩。 */

struct CoupleAvatarRef: Codable {
    var kind: String
    var value: String

    /// kind == "text" 时 value 就是要直接显示的表情/字符
    var faceText: String { kind == "text" ? value : "" }
}

struct CoupleSlot: Codable {
    var at: Double
    var text: String
}

struct CoupleSnapshot: Codable {
    var on: Bool
    var charId: String
    var taName: String
    var myName: String
    var sinceMs: Double
    var slots: [CoupleSlot]
    var taAvatar: CoupleAvatarRef
    var myAvatar: CoupleAvatarRef
    var updatedAt: Double

    var sinceDate: Date? {
        sinceMs > 0 ? Date(timeIntervalSince1970: sinceMs / 1000.0) : nil
    }

    /// 当前时间该显示第几条（时间轴靠这个对齐网页排好的槽位）
    func slotIndex(at date: Date) -> Int {
        guard !slots.isEmpty else { return 0 }
        let t = date.timeIntervalSince1970 * 1000.0
        var idx = 0
        for (i, s) in slots.enumerated() where t >= s.at { idx = i }
        return idx
    }
}

enum CoupleStore {
    static let group = "group.com.uwu.octopusink"
    static let key = "couple.snapshot.v1"

    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    static func save(_ json: String) { defaults.set(json, forKey: key) }

    static func load() -> CoupleSnapshot? {
        guard let s = defaults.string(forKey: key),
              let d = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(CoupleSnapshot.self, from: d)
    }

    // 头像直接落文件，别把几 MB 的图塞进 UserDefaults
    static let taImageName = "couple.ta.img"
    static let myImageName = "couple.my.img"

    static func fileURL(_ name: String) -> URL? {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
        return dir.appendingPathComponent(name)
    }

    static func writeImage(_ data: Data, _ name: String) {
        guard let url = fileURL(name) else { return }
        try? data.write(to: url, options: .atomic)
        imageCache.removeObject(forKey: name as NSString)
    }

    private static let imageCache = NSCache<NSString, UIImage>()

    static func image(_ name: String) -> UIImage? {
        if let hit = imageCache.object(forKey: name as NSString) { return hit }
        guard let url = fileURL(name), let img = UIImage(contentsOfFile: url.path) else { return nil }
        imageCache.setObject(img, forKey: name as NSString)
        return img
    }

    /// 头像三选一：网页缩好的 base64 / 网络图（自己去下）/ 没有
    static func resolveAvatars(ta: CoupleAvatarRef, my: CoupleAvatarRef, done: (() -> Void)? = nil) {
        let group = DispatchGroup()

        func apply(_ ref: CoupleAvatarRef, _ name: String) {
            switch ref.kind {
            case "b64":
                if let d = Data(base64Encoded: ref.value) { writeImage(d, name) }
            case "url":
                guard let u = URL(string: ref.value) else { return }
                group.enter()
                let task = URLSession.shared.dataTask(with: u) { data, _, _ in
                    defer { group.leave() }
                    if let d = data, let img = UIImage(data: d),
                       let jpg = img.jpegData(compressionQuality: 0.85) {
                        writeImage(jpg, name)
                    }
                }
                task.resume()
            default:
                break
            }
        }

        apply(ta, taImageName)
        apply(my, myImageName)
        if let done = done { group.notify(queue: .global()) { done() } }
    }
}
