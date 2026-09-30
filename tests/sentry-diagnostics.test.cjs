'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('./register-typescript.cjs');
const privacy = require('../lib/sentry-privacy.ts');
const { crashReportingOptions } = require('../lib/crash-reporting.ts');

test('Sentry retains symbolication offsets while discarding wallet material from every event field', () => {
  const secret = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const debugId = '11111111-2222-3333-4444-555555555555';
  const event = {
    type: undefined, event_id:'a'.repeat(32), release:'com.opago.wallet@1.0.0+18', dist:'18', level:'fatal',
    message:secret, logentry:{message:secret}, user:{email:secret,ip_address:'192.0.2.1'},
    request:{url:secret,headers:{Authorization:secret}}, extra:{seed:secret},
    breadcrumbs:[{message:secret}], tags:{screen:'send',invoice:secret},
    contexts:{os:{name:'iOS',version:'18.7.8'},device:{name:secret},app:{data:secret}},
    threads:{values:[{name:secret}]}, fingerprint:[secret], transaction:secret,
    exception:{values:[{type:'TypeError',value:'Cannot read property '+secret, mechanism:{type:'onerror',handled:false,data:{seed:secret}},
      stacktrace:{frames:[{filename:'app:///main.jsbundle',lineno:1,colno:23456,function:secret,vars:{seed:secret},context_line:secret},
        {filename:'https://example.com/'+secret,lineno:1,colno:1}]}}]},
    debug_meta:{images:[{type:'sourcemap',debug_id:debugId,code_file:'app:///main.jsbundle',extra:secret}]},
  };
  const clean = privacy.sanitizeCrashEvent(event);
  assert.ok(clean);
  assert.doesNotMatch(JSON.stringify(clean), /abandon|192\.0\.2\.1|Authorization|example\.com/);
  assert.equal(event.message,secret); // Never mutate the application's exception.
  assert.equal(clean.exception.values[0].value,'Cannot access null or undefined');
  assert.deepEqual(clean.exception.values[0].stacktrace.frames,[{filename:'app:///main.jsbundle',lineno:1,colno:23456,in_app:true}]);
  assert.deepEqual(clean.debug_meta.images,[{type:'sourcemap',debug_id:debugId,code_file:'app:///main.jsbundle'}]);
  assert.equal(clean.release,event.release); assert.equal(clean.dist,'18');
  // The native SDK persists fatal JS events synchronously before RN aborts.
  // This marker must survive privacy filtering or that durability path is lost.
  const sentryExports={};
  const sdkRoot=path.dirname(require.resolve('@sentry/react-native/package.json'));
  const source=fs.readFileSync(path.join(sdkRoot,'dist/js/misc.js'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:sentryExports});
  assert.equal(sentryExports.isHardCrash(clean),true);
  assert.deepEqual(clean.tags,{diagnostic_schema:'1',screen:'send'});
});

test('unknown messages, exception names, paths and malformed events fail closed', () => {
  const secret='lnbc123syntheticinvoice';
  const clean=privacy.sanitizeCrashEvent({release:secret,dist:secret,tags:{screen:secret},exception:{values:[{type:secret,value:secret,stacktrace:{frames:[{filename:secret,vars:{key:secret}}]}}]}});
  assert.doesNotMatch(JSON.stringify(clean),new RegExp(secret));
  assert.equal(clean.exception.values[0].value,'Error details withheld');
  assert.equal(privacy.sanitizeCrashEvent({message:secret}),null);
  assert.equal(privacy.sanitizeCrashEvent({exception:{get values(){throw Error(secret);}}}),null);
  assert.equal(privacy.diagnosticScreen(['(tabs)','send']),'send');
  assert.equal(privacy.diagnosticScreen(['(auth)',secret]),'authentication');
  assert.equal(privacy.diagnosticScreen([secret]),'other');
});

test('diagnostics never install payment/network, console, session or replay instrumentation', () => {
  const o=crashReportingOptions();
  const names=['ReactNativeErrorHandlers','RewriteFrames','DebugMeta','Release','Breadcrumbs','HttpClient','HttpContext','ExpoContext','ExpoRouter','TurboModuleContext','Screenshot','MobileReplay'];
  assert.deepEqual(o.integrations(names.map(name=>({name}))).map(i=>i.name),['ReactNativeErrorHandlers','RewriteFrames','DebugMeta','Release']);
  for(const key of ['sendDefaultPii','enableNativeCrashHandling','enableLogs','enableAutoSessionTracking','enableCaptureFailedRequests','enableAutoPerformanceTracing','patchGlobalPromise','enableNativeNagger','attachScreenshot','attachViewHierarchy']) assert.equal(o[key],false,key);
  assert.equal(o.maxCacheItems,10); assert.equal(o.maxQueueSize,10);
  assert.deepEqual(o.tracePropagationTargets,[]);assert.equal(o.beforeBreadcrumb({}),null);
  const hint={attachments:[{filename:'wallet.txt',data:'synthetic private data'}]};
  o.beforeSend({exception:{values:[{type:'Error',value:'private data'}]}},hint);
  assert.deepEqual(hint.attachments,[]);
});

test('iOS reuses the early privacy-filtered SDK; Android retains JavaScript-only diagnostics', () => {
  assert.equal(crashReportingOptions('ios').autoInitializeNativeSdk,false);
  assert.equal(crashReportingOptions('ios').enableNativeCrashHandling,true);
  assert.equal(crashReportingOptions('android').autoInitializeNativeSdk,true);
  assert.equal(crashReportingOptions('android').enableNativeCrashHandling,false);
});

test('native startup hook precedes React Native, is idempotent and rejects an unfiltered SDK start', () => {
  const {patchAppDelegate}=require('../plugins/with-native-crash-diagnostics');
  const source='public override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {\n let factory = ExpoReactNativeFactory()\n}';
  const output=patchAppDelegate(source,'swift');
  assert.ok(output.indexOf('OpagoNativeCrashDiagnostics.start()') < output.indexOf('let factory'));
  assert.equal(patchAppDelegate(output,'swift'),output);
  assert.throws(()=>patchAppDelegate(source.replace('let factory','RNSentrySDK.start()\n let factory'),'swift'));
  assert.throws(()=>patchAppDelegate('template changed','swift'));
  assert.throws(()=>patchAppDelegate(source,'objc'));
});

function runtime(loadSdk, env={}) {
  const exports={}; let handler=()=>{};const original=handler;
  const context={exports,process:{env},globalThis:{ErrorUtils:{getGlobalHandler:()=>handler,setGlobalHandler:h=>{handler=h;}}},
    require:name=>name==='@sentry/react-native'?loadSdk(context):privacy};
  const source=fs.readFileSync(path.join(__dirname,'../lib/crash-reporting.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:exports,handler:()=>handler,original};
}

test('missing SDK or failed initialization cannot prevent app startup and restores the original error handler', () => {
  for(const partial of [false,true]) {
    const r=runtime(context=>{
      if(!partial)throw Error('native module unavailable');
      return {init(){context.globalThis.ErrorUtils.setGlobalHandler(()=>{throw Error('broken handler');});throw Error('initialization failed');}};
    });
    assert.doesNotThrow(()=>r.api.initializeCrashReporting(false,'ios'));
    assert.equal(r.handler(),r.original);
    assert.doesNotThrow(()=>r.api.recordDiagnosticScreen(['send']));
  }
});

test('disabled, development and web builds do not load Sentry', () => {
  for(const [development,platform,env] of [[true,'ios',{}],[false,'web',{}],[false,'ios',{EXPO_PUBLIC_SENTRY_ENABLED:'false'}]]) {
    let loads=0;const r=runtime(()=>{loads++;throw Error('must not load');},env);
    r.api.initializeCrashReporting(development,platform);assert.equal(loads,0);
  }
});

test('SDK is initialized only once and failed diagnostic updates never interrupt navigation', () => {
  let calls=0;const r=runtime(()=>({init(){calls++;},setTag(){throw Error('diagnostics unavailable');}}));
  r.api.initializeCrashReporting(false,'ios');r.api.initializeCrashReporting(false,'ios');
  assert.equal(calls,1);
  assert.doesNotThrow(()=>r.api.recordDiagnosticScreen(['send']));
});

test('a native crash test requires opt-in, iOS release, active diagnostics and an initialized SDK', () => {
  for(const env of [{},{EXPO_PUBLIC_SENTRY_TEST_CONTROLS:'true',EXPO_PUBLIC_SENTRY_ENABLED:'false'}]) {
    const r=runtime(()=>({init(){},nativeCrash(){throw Error('must not call');}}),env);
    r.api.initializeCrashReporting(false,'ios');
    assert.equal(r.api.triggerNativeCrashTest(false,'ios'),false);
  }
  let crashes=0;const r=runtime(()=>({init(){},setTag(){},nativeCrash(){crashes++;}}),{EXPO_PUBLIC_SENTRY_TEST_CONTROLS:'true'});
  assert.equal(r.api.triggerNativeCrashTest(false,'ios'),false);
  r.api.initializeCrashReporting(false,'ios');
  assert.equal(r.api.triggerNativeCrashTest(true,'ios'),false);
  assert.equal(r.api.triggerNativeCrashTest(false,'android'),false);
  assert.equal(crashes,0);
  assert.equal(r.api.triggerNativeCrashTest(false,'ios'),true);
  assert.equal(crashes,1);
  const unavailable=runtime(()=>({init(){},setTag(){throw Error('unavailable');},nativeCrash(){throw Error('must not call');}}),{EXPO_PUBLIC_SENTRY_TEST_CONTROLS:'true'});
  unavailable.api.initializeCrashReporting(false,'ios');
  assert.equal(unavailable.api.triggerNativeCrashTest(false,'ios'),false);
});

test('builds without credentials skip uploads; EAS upload outages are non-blocking', () => {
  const config=require('../app.config.js');
  const token=process.env.SENTRY_AUTH_TOKEN;
  try {
    delete process.env.SENTRY_AUTH_TOKEN;
    const result=config({config:{name:'wallet',plugins:['expo-router']}});
    assert.equal(result.plugins[1][1].disableAutoUpload,true);
    assert.equal(result.name,'wallet');
    process.env.SENTRY_AUTH_TOKEN='synthetic-build-only-token';
    const configured=config({config:{plugins:[]}});
    assert.equal(configured.plugins[0][1].disableAutoUpload,false);
    assert.doesNotMatch(JSON.stringify(configured),/synthetic-build-only-token/);
  } finally {if(token===undefined)delete process.env.SENTRY_AUTH_TOKEN;else process.env.SENTRY_AUTH_TOKEN=token;}
  const eas=JSON.parse(fs.readFileSync(path.join(__dirname,'../eas.json'),'utf8'));
  for(const profile of Object.values(eas.build))assert.equal(profile.env.SENTRY_ALLOW_FAILURE,'true');
});
