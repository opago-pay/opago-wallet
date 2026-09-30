#import "OpagoNativeCrashDiagnostics.h"
#import <RNSentry/RNSentryStart.h>
#import <Sentry/Sentry.h>
#include <math.h>
@import Sentry;

// Never copy free-form fields. Native events bypass JavaScript beforeSend.
static NSString *OpagoMatch(id value, NSString *pattern) {
    if (![value isKindOfClass:NSString.class] || [value length] > 160) return nil;
    NSRange match = [value rangeOfString:pattern options:NSRegularExpressionSearch];
    return NSEqualRanges(match, NSMakeRange(0, [value length])) ? value : nil;
}

static NSString *OpagoAddress(id value) {
    return OpagoMatch(value, @"^0x[0-9a-fA-F]{1,16}$");
}

static NSNumber *OpagoNumber(id value) {
    if (![value isKindOfClass:NSNumber.class]) return nil;
    double number = [value doubleValue];
    return isfinite(number) && floor(number) == number && number >= 0 && number <= 9007199254740991.0 ? value : nil;
}

static SentryStacktrace *OpagoStack(SentryStacktrace *stack) {
    if (!stack) return nil;
    NSMutableArray<SentryFrame *> *frames = [NSMutableArray array];
    for (SentryFrame *original in stack.frames) {
        if (frames.count >= 512) break;
        NSString *address = OpagoAddress(original.instructionAddress);
        if (!address) continue;
        SentryFrame *frame = [[SentryFrame alloc] init];
        frame.instructionAddress = address;
        frame.imageAddress = OpagoAddress(original.imageAddress);
        frame.symbolAddress = OpagoAddress(original.symbolAddress);
        frame.platform = @"native";
        frame.inApp = original.inApp ? @([original.inApp boolValue]) : nil;
        // dSYM symbolication uses image addresses + Mach-O UUID, not local paths.
        [frames addObject:frame];
    }
    return frames.count ? [[SentryStacktrace alloc] initWithFrames:frames registers:@{}] : nil;
}

@implementation OpagoNativeCrashDiagnostics
+ (SentryEvent *)sanitizeEvent:(SentryEvent *)original {
    @try {
        if (!original.exceptions.count || original.type.length) return nil;
        SentryEvent *clean = [[SentryEvent alloc] initWithLevel:original.level];
        clean.eventId = original.eventId;
        clean.timestamp = original.timestamp;
        clean.platform = @"cocoa";
        clean.environment = @"production";
        clean.releaseName = OpagoMatch(original.releaseName, @"^com\\.opago\\.wallet@[0-9]+\\.[0-9]+\\.[0-9]+(?:\\+[0-9]+)?$");
        clean.dist = OpagoMatch(original.dist, @"^[0-9]{1,12}$");
        SentryUser *user = [[SentryUser alloc] init];
        user.ipAddress = @"0.0.0.0";
        clean.user = user;
        NSMutableDictionary *tags = [@{@"diagnostic_schema": @"2", @"event.origin": @"ios", @"event.environment": @"native"} mutableCopy];
        NSSet *screens = [NSSet setWithArray:@[@"home", @"send", @"receive", @"scan", @"settings", @"buy", @"deposits", @"authentication", @"other"]];
        NSString *screen = original.tags[@"screen"];
        if (screen && [screens containsObject:screen]) tags[@"screen"] = screen;
        if ([original.tags[@"diagnostic_test"] isEqual:@"native"]) tags[@"diagnostic_test"] = @"native";
        clean.tags = tags;
        NSMutableDictionary *context = [NSMutableDictionary dictionary];
        NSString *osVersion = OpagoMatch(original.context[@"os"][@"version"], @"^[0-9]{1,2}(?:\\.[0-9]{1,3}){0,2}$");
        if (osVersion) context[@"os"] = @{@"name": @"iOS", @"version": osVersion};
        NSString *model = OpagoMatch(original.context[@"device"][@"model"], @"^(?:iPhone|iPad)[0-9]{1,2},[0-9]{1,2}$");
        if (model) context[@"device"] = @{@"model": model};
        clean.context = context;

        NSSet *types = [NSSet setWithArray:@[@"SIGABRT", @"SIGSEGV", @"SIGBUS", @"SIGILL", @"SIGFPE", @"SIGTRAP", @"EXC_BAD_ACCESS", @"EXC_BAD_INSTRUCTION", @"EXC_BREAKPOINT", @"EXC_CRASH", @"NSInvalidArgumentException", @"NSRangeException", @"NSInternalInconsistencyException", @"NSGenericException"]];
        NSMutableArray *exceptions = [NSMutableArray array];
        for (SentryException *source in original.exceptions) {
            if (exceptions.count >= 8) break;
            NSString *type = source.type && [types containsObject:source.type] ? source.type : @"NativeCrash";
            SentryException *exception = [[SentryException alloc] initWithValue:@"Native error details withheld" type:type];
            exception.stacktrace = OpagoStack(source.stacktrace);
            exception.threadId = OpagoNumber(source.threadId);
            SentryMechanism *mechanism = [[SentryMechanism alloc] initWithType:@"native"];
            mechanism.handled = source.mechanism.handled ? @([source.mechanism.handled boolValue]) : @NO;
            exception.mechanism = mechanism;
            [exceptions addObject:exception];
        }
        clean.exceptions = exceptions;
        NSMutableArray *threads = [NSMutableArray array];
        for (SentryThread *source in original.threads) {
            if (threads.count >= 64) break;
            NSNumber *threadId = OpagoNumber(source.threadId);
            if (!threadId) continue;
            SentryThread *thread = [[SentryThread alloc] initWithThreadId:threadId];
            thread.crashed = source.crashed ? @([source.crashed boolValue]) : nil;
            thread.current = source.current ? @([source.current boolValue]) : nil;
            thread.isMain = source.isMain ? @([source.isMain boolValue]) : nil;
            thread.stacktrace = OpagoStack(source.stacktrace);
            [threads addObject:thread];
        }
        clean.threads = threads;
        NSMutableArray *images = [NSMutableArray array];
        for (SentryDebugMeta *source in original.debugMeta) {
            if (images.count >= 512) break;
            NSString *uuid = OpagoMatch(source.debugID, @"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
            NSString *address = OpagoAddress(source.imageAddress);
            if (!uuid || !address || ![source.type isEqualToString:@"macho"]) continue;
            SentryDebugMeta *image = [[SentryDebugMeta alloc] init];
            image.type = @"macho";
            image.debugID = uuid;
            image.imageAddress = address;
            image.imageVmAddress = OpagoAddress(source.imageVmAddress);
            image.imageSize = OpagoNumber(source.imageSize);
            [images addObject:image];
        }
        clean.debugMeta = images;
        return clean;
    } @catch (NSException *exception) {
        return nil; // Malformed data is dropped; never fall back to the raw event.
    }
}

+ (SentryOptions *)optionsForDSN:(NSString *)dsn {
    if (![dsn isKindOfClass:NSString.class] || !dsn.length) return nil;
    // The RNSentrySDK file loader can produce nil options when sentry.options.json
    // is absent: its empty-dictionary fallback requires a DSN before configuration.
    // Cocoa then dereferences options.initialScope and crashes with SIGSEGV.
    // Construct valid defaults directly, independently of any bundled JSON file.
    SentryOptions *options = [[SentryOptions alloc] init];
    if (!options) return nil;
    options.dsn = dsn;
    if (!options.dsn.length || !options.initialScope) return nil;
    [RNSentryStart updateWithReactDefaults:options];
    options.environment = @"production";
    options.debug = NO;
    options.enableCrashHandler = YES;
    options.enableMemoryIntrospection = NO;
    options.sendDefaultPii = NO;
    options.sendClientReports = NO;
    options.maxCacheItems = 10;
    options.maxBreadcrumbs = 0;
    options.maxAttachmentSize = 0;
    options.shutdownTimeInterval = 0.5;
    options.enableSwizzling = NO;
    options.enableAutoBreadcrumbTracking = NO;
    options.enableNetworkBreadcrumbs = NO;
    options.enableAutoSessionTracking = NO;
    options.enableAutoPerformanceTracing = NO;
    options.enableNetworkTracking = NO;
    options.enableCaptureFailedRequests = NO;
    options.enableFileIOTracing = NO;
    options.enableCoreDataTracing = NO;
    options.enablePersistingTracesWhenCrashing = NO;
    options.enableAppHangTracking = NO;
    options.enableWatchdogTerminationTracking = NO;
    options.enableMetricKit = NO;
    options.enableMetricKitRawPayload = NO;
    options.enableLogs = NO;
    options.enableMetrics = NO;
    options.enableSpotlight = NO;
    options.attachScreenshot = NO;
    options.attachViewHierarchy = NO;
    options.attachAllThreads = NO;
    options.tracesSampleRate = @0;
    options.tracePropagationTargets = @[];
    options.sessionReplay.sessionSampleRate = 0;
    options.sessionReplay.onErrorSampleRate = 0;
    options.beforeSend = ^SentryEvent *(SentryEvent *event) { return [self sanitizeEvent:event]; };
    options.beforeBreadcrumb = ^SentryBreadcrumb *(SentryBreadcrumb *breadcrumb) { return nil; };
    [RNSentryStart updateWithReactFinals:options];
    return options;
}

+ (void)start {
#if !DEBUG
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        if (![[NSBundle.mainBundle objectForInfoDictionaryKey:@"OpagoCrashDiagnosticsEnabled"] boolValue]) return;
        @try {
            SentryOptions *options = [self optionsForDSN:
                [NSBundle.mainBundle objectForInfoDictionaryKey:@"OpagoCrashDiagnosticsDSN"]];
            if (!options) return; // Invalid diagnostics configuration never reaches SDK startup.
            [RNSentryStart startWithOptions:options];
        } @catch (NSException *exception) {
            // Diagnostics must never abort wallet startup, even if SDK init fails.
            @try { [SentrySDK close]; } @catch (NSException *ignored) {}
        }
    });
#endif
}
@end
