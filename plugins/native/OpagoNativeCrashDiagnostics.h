#import <Foundation/Foundation.h>
@class SentryEvent;
@class SentryOptions;

NS_ASSUME_NONNULL_BEGIN
@interface OpagoNativeCrashDiagnostics : NSObject
+ (void)start NS_SWIFT_NAME(start());
+ (nullable SentryOptions *)optionsForDSN:(nullable NSString *)dsn;
+ (nullable SentryEvent *)sanitizeEvent:(SentryEvent *)event;
@end
NS_ASSUME_NONNULL_END
