import WidgetKit
import SwiftUI
import ActivityKit

struct CrabIslandWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrabActivityAttributes.self) { context in
            CrabLockView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.6))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    CrabStage(key: context.attributes.key, since: context.state.since, scale: 0.42, lock: false)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(context.attributes.title)
                            .font(.system(size: 16, weight: .semibold))
                        Text(context.attributes.detail)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Color.clear.frame(width: 0, height: 0)
                }
            } compactLeading: {
                CrabStage(key: context.attributes.key, since: context.state.since, scale: 0.30, lock: false)
            } compactTrailing: {
                EmptyView()
            } minimal: {
                CrabStage(key: context.attributes.key, since: context.state.since, scale: 0.20, lock: false)
            }
        }
    }
}

// 按比例给 CrabFrames2 指定盒子大小（网格是设备像素，1 格 ≈ ⅓ 点，scale 就是在这基础上缩放）
struct CrabStage: View {
    let key: String
    let since: Date
    let scale: CGFloat
    let lock: Bool

    var body: some View {
        if let st = CRAB_STATES_2[key] {
            CrabFrames2(st: st, since: since,
                        box: CGSize(width: CGFloat(st.w) * scale, height: CGFloat(st.h) * scale),
                        lock: lock)
        } else {
            Color.clear.frame(width: 40, height: 28)
        }
    }
}

struct CrabLockView: View {
    let context: ActivityViewContext<CrabActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            CrabStage(key: context.attributes.key, since: context.state.since, scale: 0.55, lock: true)
            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.title)
                    .font(.system(size: 17, weight: .semibold))
                Text(context.attributes.detail)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(14)
    }
}
