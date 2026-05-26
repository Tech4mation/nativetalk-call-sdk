#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Declares the Swift methods so React Native can dispatch JS calls to them.
// `RCT_EXTERN_MODULE` wires the Swift class `NativetalkCallSdk` (annotated
// with `@objc(NativetalkCallSdk)`) up to the JS bridge under the same name.
@interface RCT_EXTERN_MODULE(NativetalkCallSdk, RCTEventEmitter)

RCT_EXTERN_METHOD(init:(NSDictionary *)cfg)
RCT_EXTERN_METHOD(startNativeServices)
RCT_EXTERN_METHOD(stopNativeServices:(BOOL)logout)

RCT_EXTERN_METHOD(register:(NSDictionary *)acc)
RCT_EXTERN_METHOD(refreshRegisters)
RCT_EXTERN_METHOD(setRegisterEnabled:(BOOL)on)
RCT_EXTERN_METHOD(registerVoipToken:(NSString *)hex)

RCT_EXTERN_METHOD(call:(NSString *)sipUri)
RCT_EXTERN_METHOD(answer)
RCT_EXTERN_METHOD(hangup)
RCT_EXTERN_METHOD(end)
RCT_EXTERN_METHOD(decline:(NSString *)reason)
RCT_EXTERN_METHOD(mute:(BOOL)on)
RCT_EXTERN_METHOD(speaker:(BOOL)on)
RCT_EXTERN_METHOD(sendDtmf:(NSString *)d)
RCT_EXTERN_METHOD(hold)
RCT_EXTERN_METHOD(resume)
RCT_EXTERN_METHOD(playKeyTone:(NSString *)d)

RCT_EXTERN_METHOD(getCallLogs:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getRegistrationStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
