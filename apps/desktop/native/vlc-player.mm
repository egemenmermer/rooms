// ROOMS' small N-API adapter for the official libVLC 3 C ABI.
// No third-party Electron binding. Native source URLs are loopback capabilities only.
#include <node_api.h>
#include <stdint.h>
#include <string>
#include <cmath>
#ifdef __APPLE__
#import <Cocoa/Cocoa.h>
#include <dlfcn.h>
@interface RoomsVLCSurface : NSView
@end
@implementation RoomsVLCSurface
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end
static RoomsVLCSurface *surface;
static NSView *parent;
static void *library;
#else
#include <windows.h>
static HWND surface;
static HWND parent;
static HMODULE library;
#endif
struct libvlc_instance_t;
struct libvlc_media_player_t;
struct libvlc_media_t;
struct libvlc_media_stats_t {
 int read_bytes;float input_bitrate;int demux_read_bytes;float demux_bitrate;int demux_corrupted;int demux_discontinuity;
 int decoded_video;int decoded_audio;int displayed_pictures;int lost_pictures;int played_abuffers;int lost_abuffers;
 int sent_packets;int sent_bytes;float send_bitrate;
};
struct libvlc_track_description_t { int i_id; char *psz_name; libvlc_track_description_t *p_next; };
#define API(ret, name, args) static ret (*name) args
API(libvlc_instance_t*, libvlc_new, (int, const char* const*));
API(void, libvlc_release, (libvlc_instance_t*));
API(libvlc_media_t*, libvlc_media_new_location, (libvlc_instance_t*, const char*));
API(void, libvlc_media_add_option, (libvlc_media_t*, const char*));
API(void, libvlc_media_release, (libvlc_media_t*));
API(int, libvlc_media_get_stats, (libvlc_media_t*, libvlc_media_stats_t*));
API(libvlc_media_t*, libvlc_media_player_get_media, (libvlc_media_player_t*));
API(libvlc_media_player_t*, libvlc_media_player_new, (libvlc_instance_t*));
API(void, libvlc_media_player_set_media, (libvlc_media_player_t*, libvlc_media_t*));
API(int, libvlc_media_player_play, (libvlc_media_player_t*));
API(void, libvlc_media_player_set_pause, (libvlc_media_player_t*, int));
API(void, libvlc_media_player_stop, (libvlc_media_player_t*));
API(void, libvlc_media_player_release, (libvlc_media_player_t*));
API(int, libvlc_media_player_get_state, (libvlc_media_player_t*));
API(int64_t, libvlc_media_player_get_time, (libvlc_media_player_t*));
API(int64_t, libvlc_media_player_get_length, (libvlc_media_player_t*));
API(void, libvlc_media_player_set_time, (libvlc_media_player_t*, int64_t));
API(int, libvlc_media_player_is_seekable, (libvlc_media_player_t*));
API(int, libvlc_audio_set_volume, (libvlc_media_player_t*, int));
API(int, libvlc_audio_get_track, (libvlc_media_player_t*));
API(int, libvlc_audio_set_track, (libvlc_media_player_t*, int));
API(int, libvlc_video_get_spu, (libvlc_media_player_t*));
API(int, libvlc_video_set_spu, (libvlc_media_player_t*, int));
API(libvlc_track_description_t*, libvlc_audio_get_track_description, (libvlc_media_player_t*));
API(libvlc_track_description_t*, libvlc_video_get_spu_description, (libvlc_media_player_t*));
API(void, libvlc_track_description_list_release, (libvlc_track_description_t*));
API(int, libvlc_video_get_size, (libvlc_media_player_t*, unsigned, unsigned*, unsigned*));
API(void, libvlc_video_set_mouse_input, (libvlc_media_player_t*, unsigned));
API(void, libvlc_video_set_key_input, (libvlc_media_player_t*, unsigned));
#ifdef __APPLE__
API(void, libvlc_media_player_set_nsobject, (libvlc_media_player_t*, void*));
#else
API(void, libvlc_media_player_set_hwnd, (libvlc_media_player_t*, void*));
#endif
static libvlc_instance_t *instance;
static libvlc_media_player_t *player;
static bool disposing;
static bool creating;
static bool initialized;
static napi_value fail(napi_env env, const char *message) { napi_throw_error(env, nullptr, message); return nullptr; }
static napi_value nothing(napi_env env) { napi_value v; napi_get_undefined(env, &v); return v; }
static std::string stringArg(napi_env env, napi_value v) { size_t n=0; if(napi_get_value_string_utf8(env,v,nullptr,0,&n)!=napi_ok || n>8192) return {}; std::string s(n+1,'\0'); napi_get_value_string_utf8(env,v,s.data(),s.size(),&n); s.resize(n); return s; }
static void property(napi_env env, napi_value out, const char *key, double value) { napi_value v; napi_create_double(env,value,&v); napi_set_named_property(env,out,key,v); }
static napi_value tracks(napi_env env, libvlc_track_description_t *list) { napi_value out; napi_create_array(env,&out); unsigned i=0; for(auto *t=list;t && i<128;t=t->p_next) { napi_value entry,label; napi_create_object(env,&entry); property(env,entry,"id",t->i_id); napi_create_string_utf8(env,t->psz_name ? t->psz_name : "",NAPI_AUTO_LENGTH,&label); napi_set_named_property(env,entry,"label",label); napi_set_element(env,out,i++,entry); } if(list)libvlc_track_description_list_release(list); return out; }
#define LOAD(name) do { name = reinterpret_cast<decltype(name)>(symbol(#name)); if(!name)return fail(env,"VLC runtime is incompatible"); } while(0)
static void *symbol(const char *name) {
#ifdef __APPLE__
 return dlsym(library,name);
#else
 return reinterpret_cast<void*>(GetProcAddress(library,name));
#endif
}
static napi_value Initialize(napi_env env, napi_callback_info info) {
 size_t n=2; napi_value a[2]; napi_get_cb_info(env,info,&n,a,nullptr,nullptr); if(n!=2)return fail(env,"Runtime and plugins paths required");
 if(initialized)return nothing(env);
 auto path=stringArg(env,a[0]), plugins=stringArg(env,a[1]); if(path.empty()||plugins.empty())return fail(env,"Invalid runtime path");
#ifdef __APPLE__
 if(![NSThread isMainThread])return fail(env,"VLC requires the main thread");
 setenv("VLC_PLUGIN_PATH",plugins.c_str(),1); library=dlopen(path.c_str(),RTLD_NOW|RTLD_LOCAL);
#else
 // N-API strings are UTF-8. ANSI APIs corrupt non-ASCII Windows install paths.
 auto wide=[](const std::string &value){
  int count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0);
  std::wstring result(count,L'\0');
  if(count)MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),result.data(),count);
  return result;
 };
 auto runtimePath=wide(path), pluginPath=wide(plugins);
 if(runtimePath.empty()||pluginPath.empty())return fail(env,"Invalid UTF-8 runtime path");
 if(!SetEnvironmentVariableW(L"VLC_PLUGIN_PATH",pluginPath.c_str()))return fail(env,"VLC plugin path unavailable");
 library=LoadLibraryExW(runtimePath.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
#endif
 if(!library)return fail(env,"VLC runtime could not be loaded");
 LOAD(libvlc_new); LOAD(libvlc_release); LOAD(libvlc_media_new_location); LOAD(libvlc_media_add_option); LOAD(libvlc_media_release); LOAD(libvlc_media_get_stats); LOAD(libvlc_media_player_get_media); LOAD(libvlc_media_player_new); LOAD(libvlc_media_player_set_media); LOAD(libvlc_media_player_play); LOAD(libvlc_media_player_set_pause); LOAD(libvlc_media_player_stop); LOAD(libvlc_media_player_release); LOAD(libvlc_media_player_get_state); LOAD(libvlc_media_player_get_time); LOAD(libvlc_media_player_get_length); LOAD(libvlc_media_player_set_time); LOAD(libvlc_media_player_is_seekable); LOAD(libvlc_audio_set_volume); LOAD(libvlc_audio_get_track); LOAD(libvlc_audio_set_track); LOAD(libvlc_video_get_spu); LOAD(libvlc_video_set_spu); LOAD(libvlc_audio_get_track_description); LOAD(libvlc_video_get_spu_description); LOAD(libvlc_track_description_list_release); LOAD(libvlc_video_get_size); LOAD(libvlc_video_set_mouse_input); LOAD(libvlc_video_set_key_input);
#ifdef __APPLE__
 LOAD(libvlc_media_player_set_nsobject);
#else
 LOAD(libvlc_media_player_set_hwnd);
#endif
 initialized=true;
 return nothing(env);
}
struct Creation { napi_async_work work; napi_deferred deferred; libvlc_instance_t *instance; libvlc_media_player_t *player; };
static napi_value Create(napi_env env, napi_callback_info info) {
 size_t n=1; napi_value a[1]; napi_get_cb_info(env,info,&n,a,nullptr,nullptr); void *data=nullptr; size_t len=0;
 if(n!=1||napi_get_buffer_info(env,a[0],&data,&len)!=napi_ok||len!=sizeof(void*)||!library||player||disposing||creating)return fail(env,"Invalid VLC surface state");
#ifdef __APPLE__
 parent=(__bridge NSView*)*reinterpret_cast<void**>(data);
#else
 parent=*reinterpret_cast<HWND*>(data);
#endif
 creating=true;auto *c=new Creation{};napi_value promise,label;napi_create_promise(env,&c->deferred,&promise);napi_create_string_utf8(env,"rooms-vlc-create",NAPI_AUTO_LENGTH,&label);
 napi_create_async_work(env,nullptr,label,[](napi_env,void *raw){auto *c=(Creation*)raw;
 const char *args[]={"--ignore-config","--quiet","--no-video-title-show","--no-osd","--no-snapshot-preview","--no-metadata-network-access","--no-lua","--network-caching=1200"};
 c->instance=libvlc_new(sizeof(args)/sizeof(args[0]),args);if(c->instance)c->player=libvlc_media_player_new(c->instance);
 },[](napi_env env,napi_status status,void *raw){auto *c=(Creation*)raw;creating=false;
 if(status!=napi_ok||!c->instance||!c->player){if(c->player)libvlc_media_player_release(c->player);if(c->instance)libvlc_release(c->instance);napi_value message,error;napi_create_string_utf8(env,"VLC initialization failed",NAPI_AUTO_LENGTH,&message);napi_create_error(env,nullptr,message,&error);napi_reject_deferred(env,c->deferred,error);}
 else {instance=c->instance;player=c->player;
#ifdef __APPLE__
 surface=[[RoomsVLCSurface alloc] initWithFrame:NSZeroRect];surface.wantsLayer=YES;surface.layer.backgroundColor=NSColor.blackColor.CGColor;surface.hidden=YES;[parent addSubview:surface];libvlc_media_player_set_nsobject(player,(__bridge void*)surface);
#else
 surface=CreateWindowExW(WS_EX_TRANSPARENT,L"STATIC",L"",WS_CHILD|WS_CLIPSIBLINGS,0,0,1,1,parent,nullptr,GetModuleHandleW(nullptr),nullptr);libvlc_media_player_set_hwnd(player,surface);
#endif
 libvlc_video_set_mouse_input(player,0);libvlc_video_set_key_input(player,0);napi_resolve_deferred(env,c->deferred,nothing(env));}
 napi_delete_async_work(env,c->work);delete c;
 },c,&c->work);napi_queue_async_work(env,c->work);return promise;
}
static napi_value Play(napi_env env, napi_callback_info info) {
 size_t n=1; napi_value a[1]; napi_get_cb_info(env,info,&n,a,nullptr,nullptr); auto url=n==1?stringArg(env,a[0]):"";
 if(!player||disposing||url.rfind("http://127.0.0.1:",0)!=0)return fail(env,"A local playback capability is required");
 auto media=libvlc_media_new_location(instance,url.c_str()); if(!media)return fail(env,"VLC could not open the source"); libvlc_media_player_set_media(player,media); libvlc_media_release(media); if(libvlc_media_player_play(player)!=0)return fail(env,"VLC could not start playback"); return nothing(env);
}
static napi_value Bounds(napi_env env, napi_callback_info info) {
 size_t n=5; napi_value a[5]; napi_get_cb_info(env,info,&n,a,nullptr,nullptr); double b[4]; bool visible=false;
 if(n!=5)return fail(env,"Surface bounds required"); for(int i=0;i<4;i++)if(napi_get_value_double(env,a[i],&b[i])!=napi_ok||!std::isfinite(b[i])||b[i]<0||b[i]>32768)return fail(env,"Invalid surface bounds"); if(napi_get_value_bool(env,a[4],&visible)!=napi_ok)return fail(env,"Invalid visibility");
#ifdef __APPLE__
 if(surface){surface.hidden=!visible; NSRect r=NSMakeRect(b[0],parent.isFlipped?b[1]:parent.bounds.size.height-b[1]-b[3],b[2],b[3]);surface.frame=r;}
#else
 if(surface){SetWindowPos(surface,nullptr,(int)b[0],(int)b[1],(int)b[2],(int)b[3],SWP_NOACTIVATE|SWP_NOZORDER);ShowWindow(surface,visible?SW_SHOWNA:SW_HIDE);}
#endif
 return nothing(env);
}
static napi_value State(napi_env env, napi_callback_info) {
 napi_value out; napi_create_object(env,&out); if(!player||disposing){property(env,out,"state",5);return out;}
 libvlc_media_stats_t stats{};auto *media=libvlc_media_player_get_media(player);if(media){libvlc_media_get_stats(media,&stats);libvlc_media_release(media);}
 property(env,out,"displayedFrames",stats.displayed_pictures);property(env,out,"decodedFrames",stats.decoded_video);property(env,out,"audioBuffers",stats.played_abuffers);
 property(env,out,"state",libvlc_media_player_get_state(player)); property(env,out,"time",libvlc_media_player_get_time(player)/1000.0); property(env,out,"duration",libvlc_media_player_get_length(player)/1000.0); property(env,out,"seekable",libvlc_media_player_is_seekable(player)); property(env,out,"audioId",libvlc_audio_get_track(player)); property(env,out,"captionId",libvlc_video_get_spu(player)); unsigned w=0,h=0;libvlc_video_get_size(player,0,&w,&h);property(env,out,"width",w);property(env,out,"height",h); napi_set_named_property(env,out,"audio",tracks(env,libvlc_audio_get_track_description(player))); napi_set_named_property(env,out,"captions",tracks(env,libvlc_video_get_spu_description(player))); return out;
}
static napi_value Control(napi_env env, napi_callback_info info) {
 size_t n=2;napi_value a[2];napi_get_cb_info(env,info,&n,a,nullptr,nullptr);auto command=n==2?stringArg(env,a[0]):"";double value=0;
 if(n!=2||napi_get_value_double(env,a[1],&value)!=napi_ok||!std::isfinite(value)||!player||disposing)return fail(env,"Invalid VLC control state");
 if(command=="pause"&&(value==0||value==1))libvlc_media_player_set_pause(player,(int)value);
 else if(command=="seek"&&value>=0&&value<=604800)libvlc_media_player_set_time(player,(int64_t)(value*1000));
 else if(command=="volume"&&value>=0&&value<=100)libvlc_audio_set_volume(player,(int)value);
 else if(command=="audio"&&value>=-1&&value<=65535)libvlc_audio_set_track(player,(int)value);
 else if(command=="caption"&&value>=-1&&value<=65535)libvlc_video_set_spu(player,(int)value);
 else return fail(env,"Invalid VLC control"); return nothing(env);
}
struct Disposal { napi_async_work work; napi_deferred deferred; libvlc_media_player_t *player; libvlc_instance_t *instance; };
static napi_value Dispose(napi_env env, napi_callback_info) {
 if(disposing||creating)return fail(env,"VLC lifecycle operation is already pending"); napi_value promise;auto *d=new Disposal{};napi_create_promise(env,&d->deferred,&promise);d->player=player;d->instance=instance;player=nullptr;instance=nullptr;disposing=true;
#ifdef __APPLE__
 if(surface)surface.hidden=YES;
#else
 if(surface)ShowWindow(surface,SW_HIDE);
#endif
 napi_value label;napi_create_string_utf8(env,"rooms-vlc-stop",NAPI_AUTO_LENGTH,&label);
 napi_create_async_work(env,nullptr,label,[](napi_env,void *raw){auto *d=(Disposal*)raw;if(d->player){libvlc_media_player_stop(d->player);libvlc_media_player_release(d->player);}if(d->instance)libvlc_release(d->instance);},[](napi_env env,napi_status status,void *raw){auto *d=(Disposal*)raw;
#ifdef __APPLE__
 [surface removeFromSuperview];surface=nil;parent=nil;
#else
 if(surface)DestroyWindow(surface);surface=nullptr;parent=nullptr;
#endif
 disposing=false;if(status==napi_ok)napi_resolve_deferred(env,d->deferred,nothing(env));else napi_reject_deferred(env,d->deferred,nothing(env));napi_delete_async_work(env,d->work);delete d;},d,&d->work);napi_queue_async_work(env,d->work);return promise;
}
static napi_value Init(napi_env env,napi_value exports) { napi_property_descriptor p[]={{"initialize",nullptr,Initialize,nullptr,nullptr,nullptr,napi_default,nullptr},{"create",nullptr,Create,nullptr,nullptr,nullptr,napi_default,nullptr},{"play",nullptr,Play,nullptr,nullptr,nullptr,napi_default,nullptr},{"bounds",nullptr,Bounds,nullptr,nullptr,nullptr,napi_default,nullptr},{"state",nullptr,State,nullptr,nullptr,nullptr,napi_default,nullptr},{"control",nullptr,Control,nullptr,nullptr,nullptr,napi_default,nullptr},{"dispose",nullptr,Dispose,nullptr,nullptr,nullptr,napi_default,nullptr}};napi_define_properties(env,exports,sizeof(p)/sizeof(p[0]),p);return exports; }
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
