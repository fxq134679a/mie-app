import WidgetKit
import SwiftUI

/* 「在一起多久」：天数按零点排成时间轴，秒数交给系统自己跳，
   所以既不用刷新也不用调接口，数字一直在走。 */

struct DaysEntry: TimelineEntry {
    let date: Date
    var ready: Bool = false
    var since: Date? = nil
    var days: Int = 0
    var taName: String = ""
    var myName: String = ""
    var avatar: UIImage? = nil
    var mine: UIImage? = nil
    var taFace: String = ""
    var myFace: String = ""

    var taGlyph: String { taFace.isEmpty ? String(taName.prefix(1)) : taFace }
    var myGlyph: String { myFace.isEmpty ? String(myName.prefix(1)) : myFace }
}

struct DaysProvider: TimelineProvider {
    private let horizon = 8

    func placeholder(in context: Context) -> DaysEntry {
        var e = DaysEntry(date: Date())
        e.ready = true
        e.since = Calendar.current.date(byAdding: .day, value: -512, to: Date())
        e.days = 512
        e.taName = "满满"
        e.myName = "哲仔"
        return e
    }

    func getSnapshot(in context: Context, completion: @escaping (DaysEntry) -> Void) {
        completion(build(now: Date()).first ?? DaysEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DaysEntry>) -> Void) {
        let now = Date()
        let entries = build(now: now)
        let nextMidnight = Calendar.current.date(byAdding: .day, value: 1,
                                                 to: Calendar.current.startOfDay(for: now)) ?? now
        completion(Timeline(entries: entries, policy: .after(nextMidnight)))
    }

    private func build(now: Date) -> [DaysEntry] {
        guard let snap = CoupleStore.load(), snap.on, let since = snap.sinceDate else {
            return [DaysEntry(date: now)]
        }
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        return (0..<horizon).compactMap { i -> DaysEntry? in
            guard let day = cal.date(byAdding: .day, value: i, to: today) else { return nil }
            let shown = max(day, now)
            guard let n = cal.dateComponents([.day], from: since, to: shown).day else { return nil }
            var e = DaysEntry(date: shown)
            e.ready = true
            e.since = since
            e.days = max(n, 0)
            e.taName = snap.taName
            e.myName = snap.myName
            e.avatar = CoupleStore.image(CoupleStore.taImageName)
            e.mine = CoupleStore.image(CoupleStore.myImageName)
            e.taFace = snap.taAvatar.faceText
            e.myFace = snap.myAvatar.faceText
            return e
        }
    }
}

struct CoupleDaysView: View {
    @Environment(\.widgetFamily) var family
    var entry: DaysEntry

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
        VStack(spacing: 4) {
            pair(size: 26, overlap: 9)
            Spacer(minLength: 2)
            ticking.font(.system(size: 21, weight: .bold, design: .rounded))
                .lineLimit(2).minimumScaleFactor(0.5)
                .multilineTextAlignment(.center)
            Spacer(minLength: 0)
            Text("在一起").font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }

    private var medium: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                pair(size: 34, overlap: 12)
                Text("\(entry.myName) ♥ \(entry.taName)")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 3) {
                Text("第 \(entry.days + 1) 天")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                ticking.font(.system(size: 24, weight: .bold, design: .rounded))
                    .lineLimit(1).minimumScaleFactor(0.5)
                    .monospacedDigit()
            }
        }
    }

    private var ticking: Text {
        if let since = entry.since {
            return Text(timerInterval: since ... Date(), countsDown: false)
        }
        return Text("\(entry.days)")
    }

    private func pair(size: CGFloat, overlap: CGFloat) -> some View {
        HStack(spacing: -overlap) {
            CoupleAvatarView(image: entry.mine, fallback: entry.myGlyph, size: size)
                .zIndex(2)
            CoupleAvatarView(image: entry.avatar, fallback: entry.taGlyph, size: size)
                .zIndex(1)
        }
    }
}

struct CoupleDaysWidget: Widget {
    let kind = "coupleDays"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DaysProvider()) { entry in
            CoupleDaysView(entry: entry)
        }
        .configurationDisplayName("在一起多久")
        .description("两张头像，和一直在跳的秒数")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
