import ActivityKit

// App 和 Widget Extension 两个 target 都编译这一份，属性必须一致才能收到对方的活动。
// since：计时器起点，对齐到整 10 秒；字体的数字 0–9 = 十帧，秒的个位走到几就放第几帧。
@available(iOS 16.1, *)
struct CrabActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var since: Date
    }

    var key: String      // CRAB_STATES_2 的键，如 "在钓鱼"
    var title: String
    var detail: String
    var accent: UInt32
}
