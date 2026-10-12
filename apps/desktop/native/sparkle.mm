#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>
static SPUStandardUpdaterController *controller;
static NSString *state = @"idle";
static NSString *version;
@interface RoomsUpdateDelegate : NSObject <SPUUpdaterDelegate>
@end
@implementation RoomsUpdateDelegate
- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item { state=@"available"; version=item.displayVersionString; }
- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater { state=@"idle"; version=nil; }
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error { state=@"error"; }
- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)check error:(NSError *)error { state=error?@"error":@"idle"; }
@end
static RoomsUpdateDelegate *delegate;
static napi_value Start(napi_env env,napi_callback_info info) {
 if(![NSThread isMainThread]) { napi_throw_error(env,nullptr,"Sparkle requires the main thread"); return nullptr; }
 if(!controller) { delegate=[RoomsUpdateDelegate new]; controller=[[SPUStandardUpdaterController alloc] initWithStartingUpdater:YES updaterDelegate:delegate userDriverDelegate:nil]; }
 napi_value result; napi_get_boolean(env,controller!=nil,&result); return result;
}
static napi_value Check(napi_env env,napi_callback_info info) { if(controller && controller.updater.canCheckForUpdates) { state=@"checking"; [controller checkForUpdates:nil]; } napi_value result; napi_get_undefined(env,&result); return result; }
static napi_value Enable(napi_env env,napi_callback_info info) { size_t count=1;napi_value args[1];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);bool enabled=false;if(count!=1||napi_get_value_bool(env,args[0],&enabled)!=napi_ok){napi_throw_type_error(env,nullptr,"Boolean required");return nullptr;}controller.updater.automaticallyChecksForUpdates=enabled;controller.updater.automaticallyDownloadsUpdates=enabled;napi_value result;napi_get_undefined(env,&result);return result; }
static napi_value Status(napi_env env,napi_callback_info info) { napi_value result,value;napi_create_object(env,&result);napi_create_string_utf8(env,state.UTF8String,NAPI_AUTO_LENGTH,&value);napi_set_named_property(env,result,"state",value);if(version)napi_create_string_utf8(env,version.UTF8String,NAPI_AUTO_LENGTH,&value);else napi_get_null(env,&value);napi_set_named_property(env,result,"version",value);return result; }
static napi_value Init(napi_env env,napi_value exports) { napi_property_descriptor properties[]={{"start",nullptr,Start,nullptr,nullptr,nullptr,napi_default,nullptr},{"check",nullptr,Check,nullptr,nullptr,nullptr,napi_default,nullptr},{"enable",nullptr,Enable,nullptr,nullptr,nullptr,napi_default,nullptr},{"status",nullptr,Status,nullptr,nullptr,nullptr,napi_default,nullptr}};napi_define_properties(env,exports,4,properties);return exports; }
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
