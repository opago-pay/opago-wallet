#import <Foundation/Foundation.h>
@class SentryEvent;

NS_ASSUME_NONNULL_BEGIN
@interface OpagoNativeCrashDiagnostics : NSObject
+ (void)start NS_SWIFT_NAME(start());
+ (nullable SentryEvent *)sanitizeEvent:(SentryEvent *)event;
@end
NS_ASSUME_NONNULL_END
