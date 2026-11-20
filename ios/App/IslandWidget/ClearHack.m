// ClearHack.m —— 让 iOS 主屏小组件真透明（透出壁纸，不用截图拼）
//
// 原理：小组件扩展把自己的小组件清单交给系统时
// （WidgetKit 内部的 WidgetExtensionXPCServer.ExportedObject getAllCurrentDescriptorsWithCompletion:），
// 半路给指定 kind 的描述打上 transparent / backgroundRemovable，系统就不再垫白底。
// 办法来自 https://github.com/pookjw/ClearAndBlurredWidgets ，这里是按 ARC 重写的版本。
//
// ⚠️ 用的是苹果不公开的接口：上架 App Store 会被拒；自己用（自签 / TestFlight 内部测试）可以。
// 系统哪天改了，找不到这些类就原样交回去，小组件退回白底，不会崩。
//
// 这个文件只加进「小组件扩展」target（IslandWidget），不加进主 App。
#import <Foundation/Foundation.h>
#import <objc/message.h>
#import <objc/runtime.h>

// 全透明
static NSSet<NSString *> *XJClearKinds(void) {
    return [NSSet set];
}
// 毛玻璃，透出模糊的壁纸
static NSSet<NSString *> *XJBlurKinds(void) {
    return [NSSet setWithArray:@[@"coupleNow", @"coupleDays"]];
}

static void XJSetBool(id obj, const char *sel, BOOL v) {
    SEL s = sel_registerName(sel);
    if ([obj respondsToSelector:s]) ((void (*)(id, SEL, BOOL))objc_msgSend)(obj, s, v);
}
static void XJSetUInt(id obj, const char *sel, NSUInteger v) {
    SEL s = sel_registerName(sel);
    if ([obj respondsToSelector:s]) ((void (*)(id, SEL, NSUInteger))objc_msgSend)(obj, s, v);
}

@interface XJDescriptorFetchResult : NSObject <NSSecureCoding> {
    NSArray *_activityDescriptors;
    NSArray *_controlDescriptors;
    NSArray *_widgetDescriptors;
}
@end

@implementation XJDescriptorFetchResult

+ (BOOL)supportsSecureCoding { return YES; }

- (instancetype)initWithCoder:(NSCoder *)coder {
    if ((self = [super init])) {
        Class base = objc_lookUpClass("CHSBaseDescriptor");
        Class ctrl = objc_lookUpClass("CHSControlDescriptor");
        Class wid = objc_lookUpClass("CHSWidgetDescriptor");
        NSMutableSet *ac = [NSMutableSet setWithObject:NSArray.class]; if (base) [ac addObject:base];
        NSMutableSet *cc = [NSMutableSet setWithObject:NSArray.class]; if (ctrl) [cc addObject:ctrl];
        NSMutableSet *wc = [NSMutableSet setWithObject:NSArray.class]; if (wid) [wc addObject:wid];
        _activityDescriptors = [coder decodeObjectOfClasses:ac forKey:@"activityDescriptors"];
        _controlDescriptors = [coder decodeObjectOfClasses:cc forKey:@"controlDescriptors"];
        NSArray *widgets = [coder decodeObjectOfClasses:wc forKey:@"widgetDescriptors"];

        NSSet *clear = XJClearKinds(), *blur = XJBlurKinds();
        NSMutableArray *out = [NSMutableArray arrayWithCapacity:widgets.count];
        for (id d in widgets) {
            NSString *kind = [d respondsToSelector:sel_registerName("kind")] ? [d valueForKey:@"kind"] : nil;
            BOOL isClear = kind && [clear containsObject:kind], isBlur = kind && [blur containsObject:kind];
            if ((isClear || isBlur) && [d respondsToSelector:@selector(mutableCopyWithZone:)]) {
                id m = [d mutableCopy];
                XJSetBool(m, "setBackgroundRemovable:", YES);
                XJSetBool(m, "setTransparent:", YES);
                if (isBlur) XJSetBool(m, "setSupportsVibrantContent:", YES);
                XJSetUInt(m, "setPreferredBackgroundStyle:", isBlur ? 2 : 1);
                [out addObject:m];
            } else {
                [out addObject:d];
            }
        }
        _widgetDescriptors = [out copy];
    }
    return self;
}

- (void)encodeWithCoder:(NSCoder *)coder {
    [coder encodeObject:_activityDescriptors forKey:@"activityDescriptors"];
    [coder encodeObject:_controlDescriptors forKey:@"controlDescriptors"];
    [coder encodeObject:_widgetDescriptors forKey:@"widgetDescriptors"];
}

@end

static void (*XJOriginalGetAll)(id, SEL, id);

static id XJPatch(id result) {
    @try {
        Class wkResult = objc_lookUpClass("_TtC9WidgetKit21DescriptorFetchResult");
        if (!wkResult || !result) return result;
        NSKeyedArchiver *a1 = [[NSKeyedArchiver alloc] initRequiringSecureCoding:YES];
        [result encodeWithCoder:a1];
        NSError *err = nil;
        NSKeyedUnarchiver *u1 = [[NSKeyedUnarchiver alloc] initForReadingFromData:a1.encodedData error:&err];
        if (err || !u1) return result;
        XJDescriptorFetchResult *mine = [[XJDescriptorFetchResult alloc] initWithCoder:u1];
        [u1 finishDecoding];
        NSKeyedArchiver *a2 = [[NSKeyedArchiver alloc] initRequiringSecureCoding:YES];
        [mine encodeWithCoder:a2];
        NSKeyedUnarchiver *u2 = [[NSKeyedUnarchiver alloc] initForReadingFromData:a2.encodedData error:&err];
        if (err || !u2) return result;
        id patched = [(id<NSCoding>)[wkResult alloc] initWithCoder:u2];
        [u2 finishDecoding];
        return patched ?: result;
    } @catch (NSException *e) {
        return result;
    }
}

static void XJGetAll(id self, SEL _cmd, void (^completion)(id)) {
    XJOriginalGetAll(self, _cmd, ^(id result) {
        completion(XJPatch(result));
    });
}

@interface XJClearHack : NSObject
@end

@implementation XJClearHack

+ (void)load {
    Class c = objc_lookUpClass("_TtCC9WidgetKit24WidgetExtensionXPCServer14ExportedObject");
    if (!c) return;
    Method m = class_getInstanceMethod(c, sel_registerName("getAllCurrentDescriptorsWithCompletion:"));
    if (!m) return;
    XJOriginalGetAll = (void (*)(id, SEL, id))method_getImplementation(m);
    method_setImplementation(m, (IMP)XJGetAll);
}

@end
