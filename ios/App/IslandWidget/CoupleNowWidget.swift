import WidgetKit
import SwiftUI

/* 「TA此刻」：网页侧已经把一整天排成 8 个槽位，这里只按时间取对应那条，
   整个过程不碰任何接口。排好的时间用完了就接着每 3 小时轮一条。 */

let coupleStepSec: TimeInterval = 3 * 3600

enum CoupleClearModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(.clear, for: .widget)
        } else {
            content
        }
    }
}

extension View {
    func coupleClearBackground() -> some View { modifier(CoupleClearModifier()) }
}

struct CoupleAvatarView: View {
    let image: UIImage?
    let fallback: String
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(Color.secondary.opacity(0.22))
            if let image = image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text(fallback.isEmpty ? "?" : fallback)
                    .font(.system(size: size * 0.46, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.5))
    }
}

// MARK: - TA此刻

struct NowEntry: TimelineEntry {
    let date: Date
    var ready: Bool = false
    var taName: String = ""
    var myName: String = ""
    var text: String = ""
    var nextText: String = ""
    var nextDate: Date? = nil
    var avatar: UIImage? = nil
    var mine: UIImage? = nil
    var taFace: String = ""
    var myFace: String = ""
    var stale: Bool = false

    var taGlyph: String { taFace.isEmpty ? String(taName.prefix(1)) : taFace }
    var myGlyph: String { myFace.isEmpty ? String(myName.prefix(1)) : myFace }
}

struct NowProvider: TimelineProvider {
    func placeholder(in context: Context) -> NowEntry {
        var e = NowEntry(date: Date())
        e.ready = true
        e.taName = "满满"
        e.text = "在窗边晒太阳，等你回来"
        return e
    }

    func getSnapshot(in context: Context, completion: @escaping (NowEntry) -> Void) {
        completion(build(now: Date()).first ?? NowEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NowEntry>) -> Void) {
        let now = Date()
        let entries = build(now: now)
        let tail = entries.last?.date ?? now.addingTimeInterval(coupleStepSec)
        completion(Timeline(entries: entries, policy: .after(tail.addingTimeInterval(coupleStepSec))))
    }

    private func build(now: Date) -> [NowEntry] {
        guard let snap = CoupleStore.load(), snap.on else { return [NowEntry(date: now)] }

        let stale = snap.updatedAt > 0 && (now.timeIntervalSince1970 * 1000 - snap.updatedAt) > 30 * 3600 * 1000
        let taImg = CoupleStore.image(CoupleStore.taImageName)
        let myImg = CoupleStore.image(CoupleStore.myImageName)

        func entry(_ date: Date, _ text: String, next: String = "", nextDate: Date? = nil) -> NowEntry {
            var e = NowEntry(date: date)
            e.ready = true
            e.taName = snap.taName
            e.myName = snap.myName
            e.text = text
            e.nextText = next
            e.nextDate = nextDate
            e.avatar = taImg
            e.mine = myImg
            e.taFace = snap.taAvatar.faceText
            e.myFace = snap.myAvatar.faceText
            e.stale = stale
            return e
        }

        let picked = snap.slots.filter { !$0.text.isEmpty }
        let texts = picked.map { $0.text }
        let times = picked.map { $0.at / 1000.0 }
        guard texts.count > 1 else {
            return [entry(now, texts.first ?? "")]
        }

        // 槽位还没走完就照原时刻显示；走完了从当下重排，并把文案整体往后轮
        let expired = now.timeIntervalSince1970 > (times.max() ?? 0)
        let start = expired ? now.timeIntervalSince1970 : times[0]
        let shift = expired ? Int((now.timeIntervalSince1970 - times[0]) / coupleStepSec) % texts.count : 0

        return (0..<texts.count).map { i -> NowEntry in
            let raw = start + Double(i) * coupleStepSec
            let date = (i == 0 && raw > now.timeIntervalSince1970) ? now : Date(timeIntervalSince1970: raw)
            let ti = mod(i + shift, texts.count)
            return entry(date, texts[ti],
                         next: texts[mod(ti + 1, texts.count)],
                         nextDate: date.addingTimeInterval(coupleStepSec))
        }
    }

    private func mod(_ a: Int, _ m: Int) -> Int { ((a % m) + m) % m }
}

struct CoupleNowView: View {
    @Environment(\.widgetFamily) var family
    var entry: NowEntry

    var body: some View {
        Group {
            if !entry.ready {
                CoupleEmptyView()
            } else if family == .systemMedium {
                medium
            } else {
                small
            }
        }
        .coupleClearBackground()
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                CoupleAvatarView(image: entry.avatar, fallback: entry.taGlyph, size: 22)
                Text(entry.taName)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                Spacer(minLength: 0)
                if entry.stale { dot }
            }
            Spacer(minLength: 2)
            Text(entry.text.isEmpty ? "没留话" : entry.text)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .lineLimit(4)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if !entry.nextText.isEmpty, let nd = entry.nextDate {
                HStack(spacing: 3) {
                    Image(systemName: "arrow.turn.right").font(.system(size: 8))
                    Text(fmt(nd) + " · " + entry.nextText)
                        .font(.system(size: 10))
                        .lineLimit(1)
                }
                .foregroundStyle(.secondary)
            }
        }
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                CoupleAvatarView(image: entry.avatar, fallback: entry.taGlyph, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.taName)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .lineLimit(1)
                    Text("和 \(entry.myName) 的此刻")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if entry.stale { dot }
            }
            Text(entry.text.isEmpty ? "没留话" : entry.text)
                .font(.system(size: 17, weight: .medium, design: .rounded))
                .lineLimit(3)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if !entry.nextText.isEmpty, let nd = entry.nextDate {
                HStack(spacing: 4) {
                    Text(fmt(nd)).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                    Text(entry.nextText).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
    }

    private var dot: some View {
        Circle().fill(Color.orange.opacity(0.85)).frame(width: 6, height: 6)
    }

    private func fmt(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.setLocalizedDateFormatFromTemplate("HHmm")
        return f.string(from: d)
    }
}

struct CoupleEmptyView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 22, weight: .light))
                .foregroundStyle(.secondary)
            Text("打开 Mie 同步一次")
                .font(.system(size: 11, design: .rounded))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct CoupleNowWidget: Widget {
    let kind = "coupleNow"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NowProvider()) { entry in
            CoupleNowView(entry: entry)
        }
        .configurationDisplayName("TA 此刻")
        .description("一天里 TA 正在做的事")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
