// Run in an iOS XCTest target hosted by the generated Opago app on macOS.
#import <XCTest/XCTest.h>
#import <Sentry/Sentry.h>
#import "OpagoNativeCrashDiagnostics.h"
@import Sentry;

@interface OpagoNativeCrashPrivacyTests : XCTestCase
@end
@implementation OpagoNativeCrashPrivacyTests
- (void)testStartupOptionsDoNotRequireBundledJSONAndKeepDefaultScope {
    // Build 22 crashed after the file loader passed nil options to Cocoa startup.
    SentryOptions *options = [OpagoNativeCrashDiagnostics optionsForDSN:
        @"https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com/1"];
    XCTAssertNotNil(options);
    XCTAssertNotNil(options.initialScope);
    SentryScope *scope = [[SentryScope alloc] init];
    XCTAssertEqual(options.initialScope(scope), scope);
    XCTAssertTrue(options.enableCrashHandler);
    XCTAssertFalse(options.enableMemoryIntrospection);
    XCTAssertFalse(options.sendDefaultPii);
    XCTAssertFalse(options.enableAutoSessionTracking);
    XCTAssertNotNil(options.beforeSend);
    SentryEvent *event = [[SentryEvent alloc] initWithLevel:kSentryLevelFatal];
    event.exceptions = @[[[SentryException alloc] initWithValue:@"private" type:@"SIGABRT"]];
    XCTAssertEqualObjects(options.beforeSend(event).exceptions.firstObject.value,
        @"Native error details withheld");
    event.exceptions = @[[[SentryException alloc] initWithValue:@"private" type:@"Unhandled JS Exception"]];
    XCTAssertNil(options.beforeSend(event)); // React Native's duplicate suppression remains installed.
}

- (void)testMissingOrInvalidDSNSkipsDiagnosticsStartup {
    XCTAssertNil([OpagoNativeCrashDiagnostics optionsForDSN:nil]);
    XCTAssertNil([OpagoNativeCrashDiagnostics optionsForDSN:@""]);
    XCTAssertNil([OpagoNativeCrashDiagnostics optionsForDSN:@"not-a-dsn"]);
}

- (void)testPrivateFieldsAreRemovedAndSymbolicationSurvives {
    NSString *secret = @"synthetic-wallet-secret-never-upload";
    SentryEvent *event = [[SentryEvent alloc] initWithLevel:kSentryLevelFatal];
    event.releaseName = @"com.opago.wallet@1.0.0+19";
    event.dist = @"19";
    event.extra = @{@"key": secret};
    event.message = [[SentryMessage alloc] initWithFormatted:secret];
    SentryRequest *request = [[SentryRequest alloc] init];
    request.url = secret;
    request.headers = @{@"Authorization": secret};
    event.request = request;
    SentryBreadcrumb *breadcrumb = [[SentryBreadcrumb alloc] initWithLevel:kSentryLevelInfo category:secret];
    breadcrumb.message = secret;
    event.breadcrumbs = @[breadcrumb];
    event.tags = @{@"screen": @"send", @"wallet": secret};
    event.transaction = secret;
    event.fingerprint = @[secret];
    event.context = @{@"os": @{@"version": @"18.7.8"}, @"device": @{@"model": @"iPhone16,1", @"name": secret}, @"app": @{@"secret": secret}};
    SentryUser *user = [[SentryUser alloc] initWithUserId:secret];
    user.ipAddress = @"192.0.2.1";
    event.user = user;
    SentryFrame *frame = [[SentryFrame alloc] init];
    frame.instructionAddress = @"0x100001234";
    frame.imageAddress = @"0x100000000";
    frame.function = secret;
    frame.fileName = secret;
    frame.package = secret;
    frame.vars = @{@"seed": secret};
    SentryStacktrace *stack = [[SentryStacktrace alloc] initWithFrames:@[frame] registers:@{@"x0": secret}];
    SentryException *exception = [[SentryException alloc] initWithValue:secret type:@"SIGABRT"];
    exception.stacktrace = stack;
    exception.threadId = @1;
    exception.mechanism = [[SentryMechanism alloc] initWithType:secret];
    exception.mechanism.data = @{@"key": secret};
    exception.mechanism.handled = @NO;
    event.exceptions = @[exception];
    SentryThread *thread = [[SentryThread alloc] initWithThreadId:@1];
    thread.name = secret;
    thread.crashed = @YES;
    thread.stacktrace = stack;
    event.threads = @[thread];
    SentryDebugMeta *image = [[SentryDebugMeta alloc] init];
    image.type = @"macho";
    image.debugID = @"11111111-2222-3333-4444-555555555555";
    image.codeFile = secret;
    image.imageAddress = @"0x100000000";
    image.imageVmAddress = @"0x100000000";
    image.imageSize = @4096;
    event.debugMeta = @[image];
    SentryEvent *clean = [OpagoNativeCrashDiagnostics sanitizeEvent:event];
    XCTAssertNotNil(clean);
    NSData *json = [NSJSONSerialization dataWithJSONObject:[clean serialize] options:0 error:nil];
    NSString *serialized = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    XCTAssertFalse([serialized containsString:secret]);
    XCTAssertFalse([serialized containsString:@"192.0.2.1"]);
    XCTAssertEqualObjects(clean.exceptions.firstObject.type, @"SIGABRT");
    XCTAssertEqualObjects(clean.exceptions.firstObject.stacktrace.frames.firstObject.instructionAddress, @"0x100001234");
    XCTAssertEqualObjects(clean.debugMeta.firstObject.debugID, image.debugID);
    XCTAssertEqualObjects(clean.debugMeta.firstObject.imageVmAddress, image.imageVmAddress);
    XCTAssertEqualObjects(clean.debugMeta.firstObject.imageSize, @4096);
    XCTAssertEqualObjects(clean.tags[@"screen"], @"send");
    XCTAssertEqualObjects(event.extra[@"key"], secret); // Original event stays untouched.
}

- (void)testMalformedAddressesAndUnknownTypesAreWithheld {
    SentryEvent *event = [[SentryEvent alloc] init];
    SentryFrame *frame = [[SentryFrame alloc] init];
    frame.instructionAddress = @"synthetic-secret";
    SentryException *exception = [[SentryException alloc] initWithValue:@"private" type:@"private"];
    exception.stacktrace = [[SentryStacktrace alloc] initWithFrames:@[frame] registers:@{}];
    event.exceptions = @[exception];
    SentryEvent *clean = [OpagoNativeCrashDiagnostics sanitizeEvent:event];
    XCTAssertEqualObjects(clean.exceptions.firstObject.type, @"NativeCrash");
    XCTAssertNil(clean.exceptions.firstObject.stacktrace);
    event.exceptions = @[];
    XCTAssertNil([OpagoNativeCrashDiagnostics sanitizeEvent:event]);
}
@end
