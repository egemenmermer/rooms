// Human-approved full-monitor input only. No clipboard, files, credentials or unattended mode.
#include <node_api.h>
#include <atomic>
#include <cmath>
#include <map>
#include <mutex>
#include <string>
#include <vector>
#ifdef __APPLE__
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#else
#include <windows.h>
#include <thread>
#include <condition_variable>
#endif
static std::atomic<bool> active{false};
static std::mutex guard;
static std::map<int,bool> keys;
static std::map<int,bool> buttons;
static double bx,by,bw,bh,px,py;
static constexpr uint64_t marker=0x524f4f4d5343544cULL;
#ifdef __APPLE__
static CFMachPortRef tap=nullptr;
static CFRunLoopSourceRef tapSource=nullptr;
static uint64_t armedAt=0;
static CGEventFlags flags() {
 CGEventFlags f=0;
 if(keys[56]||keys[60])f|=kCGEventFlagMaskShift;
 if(keys[59]||keys[62])f|=kCGEventFlagMaskControl;
 if(keys[58]||keys[61])f|=kCGEventFlagMaskAlternate;
 if(keys[55]||keys[54])f|=kCGEventFlagMaskCommand;
 return f;
}
static bool selectedFocus() {
 AXUIElementRef system=AXUIElementCreateSystemWide();CFTypeRef app=nullptr,window=nullptr,position=nullptr,size=nullptr;
 AXUIElementSetMessagingTimeout(system,0.05);
 bool ok=AXUIElementCopyAttributeValue(system,kAXFocusedApplicationAttribute,&app)==kAXErrorSuccess&&app;
 if(ok)AXUIElementSetMessagingTimeout((AXUIElementRef)app,0.05);
 if(ok)ok=AXUIElementCopyAttributeValue((AXUIElementRef)app,kAXFocusedWindowAttribute,&window)==kAXErrorSuccess&&window;
 if(ok)AXUIElementSetMessagingTimeout((AXUIElementRef)window,0.05);
 if(ok)ok=AXUIElementCopyAttributeValue((AXUIElementRef)window,kAXPositionAttribute,&position)==kAXErrorSuccess&&position&&AXUIElementCopyAttributeValue((AXUIElementRef)window,kAXSizeAttribute,&size)==kAXErrorSuccess&&size;
 CGPoint p{};CGSize s{};
 if(ok)ok=CFGetTypeID(position)==AXValueGetTypeID()&&CFGetTypeID(size)==AXValueGetTypeID()&&AXValueGetValue((AXValueRef)position,kAXValueTypeCGPoint,&p)&&AXValueGetValue((AXValueRef)size,kAXValueTypeCGSize,&s)&&p.x>=bx-2&&p.y>=by-2&&p.x+s.width<=bx+bw+2&&p.y+s.height<=by+bh+2;
 if(size)CFRelease(size);if(position)CFRelease(position);if(window)CFRelease(window);if(app)CFRelease(app);CFRelease(system);return ok;
}
static bool postKey(int code,bool down) {
 CGEventRef e=CGEventCreateKeyboardEvent(nullptr,static_cast<CGKeyCode>(code),down);
 if(!e)return false;
 CGEventSetIntegerValueField(e,kCGEventSourceUserData,marker);
 CGEventSetFlags(e,flags()); CGEventPost(kCGHIDEventTap,e); CFRelease(e); return true;
}
static bool postMouse(int button,bool down,bool move) {
 if(move)button=buttons[0]?0:buttons[1]?1:buttons[2]?2:0;
 CGMouseButton b=button==1?kCGMouseButtonRight:button==2?kCGMouseButtonCenter:kCGMouseButtonLeft;
 CGEventType type=move ? (buttons[0]?kCGEventLeftMouseDragged:buttons[1]?kCGEventRightMouseDragged:buttons[2]?kCGEventOtherMouseDragged:kCGEventMouseMoved) : button==0?(down?kCGEventLeftMouseDown:kCGEventLeftMouseUp):button==1?(down?kCGEventRightMouseDown:kCGEventRightMouseUp):(down?kCGEventOtherMouseDown:kCGEventOtherMouseUp);
 CGEventRef e=CGEventCreateMouseEvent(nullptr,type,CGPointMake(px,py),b);
 if(!e)return false;
 CGEventSetIntegerValueField(e,kCGEventSourceUserData,marker); CGEventSetFlags(e,flags()); CGEventPost(kCGHIDEventTap,e); CFRelease(e); return true;
}
#else
static std::thread hookThread;
static DWORD hookThreadId=0,armedAt=0;
static HHOOK mouseHook=nullptr,keyHook=nullptr;
static std::atomic<bool> hookReady{false};
static bool defaultDesktop() {
 HDESK d=OpenInputDesktop(0,FALSE,DESKTOP_READOBJECTS);
 if(!d)return false;
 wchar_t name[128]; DWORD needed=0;
 bool ok=GetUserObjectInformationW(d,UOI_NAME,name,sizeof(name),&needed)&&std::wstring(name)==L"Default";
 CloseDesktop(d); return ok;
}
static bool send(INPUT &input) { return SendInput(1,&input,sizeof(INPUT))==1; }
static bool selectedFocus() {
 HWND window=GetForegroundWindow();if(!window)return false;
 const auto old=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 RECT rect{};bool ok=GetWindowRect(window,&rect);SetThreadDpiAwarenessContext(old);
 return ok&&rect.left>=bx-16&&rect.top>=by-16&&rect.right<=bx+bw+16&&rect.bottom<=by+bh+16;
}
static bool postKey(int code,bool down) {
 INPUT i{}; i.type=INPUT_KEYBOARD; i.ki.wVk=static_cast<WORD>(code); i.ki.dwExtraInfo=static_cast<ULONG_PTR>(marker);
 i.ki.dwFlags=down?0:KEYEVENTF_KEYUP;
 if((code>=VK_PRIOR&&code<=VK_DOWN)||code==VK_INSERT||code==VK_DELETE||code==VK_RCONTROL||code==VK_RMENU||code==VK_LWIN||code==VK_RWIN)i.ki.dwFlags|=KEYEVENTF_EXTENDEDKEY;
 return send(i);
}
static bool postMouse(int button,bool down,bool move) {
 INPUT i{}; i.type=INPUT_MOUSE; i.mi.dwExtraInfo=static_cast<ULONG_PTR>(marker);
 if(move) {
  const auto old=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  const int vx=GetSystemMetrics(SM_XVIRTUALSCREEN),vy=GetSystemMetrics(SM_YVIRTUALSCREEN),vw=GetSystemMetrics(SM_CXVIRTUALSCREEN),vh=GetSystemMetrics(SM_CYVIRTUALSCREEN);
  SetThreadDpiAwarenessContext(old);
  if(vw<2||vh<2)return false;
  i.mi.dx=static_cast<LONG>(std::lround((px-vx)*65535.0/(vw-1)));
  i.mi.dy=static_cast<LONG>(std::lround((py-vy)*65535.0/(vh-1)));
  i.mi.dwFlags=MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE|MOUSEEVENTF_VIRTUALDESK;
 } else i.mi.dwFlags=button==0?(down?MOUSEEVENTF_LEFTDOWN:MOUSEEVENTF_LEFTUP):button==1?(down?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_RIGHTUP):(down?MOUSEEVENTF_MIDDLEDOWN:MOUSEEVENTF_MIDDLEUP);
 return send(i);
}
#endif
// Caller holds guard. Release keys/buttons even when the active lease has already expired.
static void releaseLocked() {
 active=false;
 std::vector<int> heldKeys,heldButtons;
 for(const auto &p:keys)if(p.second)heldKeys.push_back(p.first);
 for(const auto &p:buttons)if(p.second)heldButtons.push_back(p.first);
 for(int key:heldKeys){keys[key]=false;postKey(key,false);}
 for(int button:heldButtons){buttons[button]=false;postMouse(button,false,false);}
 keys.clear();buttons.clear();
}
static void stop() { std::lock_guard<std::mutex> lock(guard); releaseLocked(); }
#ifdef __APPLE__
static CGEventRef localInput(CGEventTapProxy,CGEventType type,CGEventRef event,void*) {
 if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput) {stop();return event;}
 if(!active||CGEventGetTimestamp(event)<armedAt||CGEventGetIntegerValueField(event,kCGEventSourceUserData)==static_cast<int64_t>(marker))return event;
 stop();return event;
}
static bool hooks() {
 if(tapSource){CFRunLoopRemoveSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CFRelease(tapSource);tapSource=nullptr;}
 if(tap){CFMachPortInvalidate(tap);CFRelease(tap);tap=nullptr;}
 const CGEventMask mask=CGEventMaskBit(kCGEventKeyDown)|CGEventMaskBit(kCGEventKeyUp)|CGEventMaskBit(kCGEventFlagsChanged)|CGEventMaskBit(kCGEventMouseMoved)|CGEventMaskBit(kCGEventLeftMouseDown)|CGEventMaskBit(kCGEventLeftMouseUp)|CGEventMaskBit(kCGEventRightMouseDown)|CGEventMaskBit(kCGEventRightMouseUp)|CGEventMaskBit(kCGEventOtherMouseDown)|CGEventMaskBit(kCGEventScrollWheel);
 tap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionListenOnly,mask,localInput,nullptr);
 if(!tap)return false;
 tapSource=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0);
 if(!tapSource)return false;
 CFRunLoopAddSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CGEventTapEnable(tap,true);return true;
}
#else
static LRESULT CALLBACK keyboardInput(int code,WPARAM w,LPARAM l) {
 if(code==HC_ACTION&&active) {const auto *event=reinterpret_cast<KBDLLHOOKSTRUCT*>(l);if(event->dwExtraInfo!=static_cast<ULONG_PTR>(marker)&&static_cast<LONG>(event->time-armedAt)>=0)stop();}
 return CallNextHookEx(keyHook,code,w,l);
}
static LRESULT CALLBACK mouseInput(int code,WPARAM w,LPARAM l) {
 if(code==HC_ACTION&&active) {const auto *event=reinterpret_cast<MSLLHOOKSTRUCT*>(l);if(event->dwExtraInfo!=static_cast<ULONG_PTR>(marker)&&static_cast<LONG>(event->time-armedAt)>=0)stop();}
 return CallNextHookEx(mouseHook,code,w,l);
}
static bool hooks() {
 if(hookThread.joinable())return hookReady;
 hookThread=std::thread([]{
  hookThreadId=GetCurrentThreadId();MSG msg;PeekMessageW(&msg,nullptr,WM_USER,WM_USER,PM_NOREMOVE);
  HMODULE module=nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,reinterpret_cast<LPCWSTR>(&keyboardInput),&module);
  keyHook=SetWindowsHookExW(WH_KEYBOARD_LL,keyboardInput,module,0);
  mouseHook=SetWindowsHookExW(WH_MOUSE_LL,mouseInput,module,0);
  hookReady=keyHook&&mouseHook;
  while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}
  if(keyHook)UnhookWindowsHookEx(keyHook);if(mouseHook)UnhookWindowsHookEx(mouseHook);keyHook=nullptr;mouseHook=nullptr;hookReady=false;
 });
 for(int i=0;i<200&&!hookReady;i++)Sleep(5);
 return hookReady;
}
struct MonitorMatch {RECT wanted;bool matched=false;};
static BOOL CALLBACK matchMonitor(HMONITOR, HDC, LPRECT rect, LPARAM value) {
 auto *match=reinterpret_cast<MonitorMatch*>(value);if(EqualRect(rect,&match->wanted))match->matched=true;return TRUE;
}
#endif
static napi_value boolean(napi_env env,bool value){napi_value out;napi_get_boolean(env,value,&out);return out;}
static bool number(napi_env env,napi_value value,double &out){return napi_get_value_double(env,value,&out)==napi_ok&&std::isfinite(out);}
static napi_value status(napi_env env,napi_callback_info) {
 napi_value out;napi_create_object(env,&out);
 napi_set_named_property(env,out,"supported",boolean(env,true));
#ifdef __APPLE__
 const bool permission=AXIsProcessTrusted()&&CGPreflightListenEventAccess();
#else
 const bool permission=defaultDesktop();
#endif
 napi_set_named_property(env,out,"permission",boolean(env,permission));
 napi_set_named_property(env,out,"active",boolean(env,active));return out;
}
static napi_value begin(napi_env env,napi_callback_info info) {
 size_t n=5;napi_value args[5];napi_get_cb_info(env,info,&n,args,nullptr,nullptr);
 double display,x,y,w,h;
 if(n!=5||!number(env,args[0],display)||!number(env,args[1],x)||!number(env,args[2],y)||!number(env,args[3],w)||!number(env,args[4],h)||w<1||h<1||w>32768||h>32768||std::abs(x)>100000||std::abs(y)>100000)return boolean(env,false);
 stop();
#ifdef __APPLE__
 if(display<1||display>UINT32_MAX||!AXIsProcessTrusted()||!CGPreflightListenEventAccess())return boolean(env,false);
 const auto id=static_cast<CGDirectDisplayID>(display);const CGRect rect=CGDisplayBounds(id);
 if(!CGDisplayIsActive(id)||rect.origin.x!=x||rect.origin.y!=y||rect.size.width!=w||rect.size.height!=h||!hooks())return boolean(env,false);
 CGEventRef clock=CGEventCreate(nullptr);armedAt=clock?CGEventGetTimestamp(clock):0;if(clock)CFRelease(clock);
#else
 if(!defaultDesktop())return boolean(env,false);
 const auto old=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 MonitorMatch match{{static_cast<LONG>(x),static_cast<LONG>(y),static_cast<LONG>(x+w),static_cast<LONG>(y+h)}};
 EnumDisplayMonitors(nullptr,nullptr,matchMonitor,reinterpret_cast<LPARAM>(&match));SetThreadDpiAwarenessContext(old);
 if(!match.matched||!hooks())return boolean(env,false);armedAt=GetTickCount();
#endif
 std::lock_guard<std::mutex> lock(guard);bx=x;by=y;bw=w;bh=h;px=x;py=y;active=true;return boolean(env,true);
}
static napi_value apply(napi_env env,napi_callback_info info) {
 size_t n=5;napi_value args[5];napi_get_cb_info(env,info,&n,args,nullptr,nullptr);
 double kind,a,b,code;bool down;
 if(n!=5||!number(env,args[0],kind)||!number(env,args[1],a)||!number(env,args[2],b)||!number(env,args[3],code)||napi_get_value_bool(env,args[4],&down)!=napi_ok)return boolean(env,false);
 std::lock_guard<std::mutex> lock(guard);if(!active)return boolean(env,false);
#ifndef __APPLE__
 if(!defaultDesktop()){releaseLocked();return boolean(env,false);}
#endif
 bool ok=false;
 if(kind==0||kind==1) {
  if(a<0||a>1||b<0||b>1||code<0||code>2)return boolean(env,false);
  px=bx+std::floor(a*(bw-1));py=by+std::floor(b*(bh-1));
  ok=postMouse(static_cast<int>(code),down,true);
  if(kind==1){buttons[static_cast<int>(code)]=down;ok=postMouse(static_cast<int>(code),down,false)&&ok;}
 } else if(kind==2) {
  if(code<0||code>255||std::floor(code)!=code)return boolean(env,false);
  if(down&&!selectedFocus()){releaseLocked();return boolean(env,false);}
  keys[static_cast<int>(code)]=down;ok=postKey(static_cast<int>(code),down);
 } else if(kind==3) {
  if(std::abs(a)>1200||std::abs(b)>1200)return boolean(env,false);
#ifdef __APPLE__
  CGEventRef event=CGEventCreateScrollWheelEvent(nullptr,kCGScrollEventUnitPixel,2,static_cast<int>(-b),static_cast<int>(-a));
  if(event){CGEventSetIntegerValueField(event,kCGEventSourceUserData,marker);CGEventPost(kCGHIDEventTap,event);CFRelease(event);ok=true;}
#else
  ok=true;for(int axis=0;axis<2;axis++){const double value=axis?a:b;if(value==0)continue;INPUT i{};i.type=INPUT_MOUSE;i.mi.dwExtraInfo=static_cast<ULONG_PTR>(marker);i.mi.dwFlags=axis?MOUSEEVENTF_HWHEEL:MOUSEEVENTF_WHEEL;i.mi.mouseData=static_cast<DWORD>(static_cast<LONG>(axis?value:-value));ok=send(i)&&ok;}
#endif
 } else if(kind==4){releaseLocked();return boolean(env,true);}
 if(!ok)releaseLocked();return boolean(env,ok);
}
static void shutdownHooks() {
#ifdef __APPLE__
 if(tapSource){CFRunLoopRemoveSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CFRelease(tapSource);tapSource=nullptr;}if(tap){CFMachPortInvalidate(tap);CFRelease(tap);tap=nullptr;}
#else
 if(hookThread.joinable()){PostThreadMessageW(hookThreadId,WM_QUIT,0,0);hookThread.join();}
#endif
}
static napi_value end(napi_env env,napi_callback_info){stop();shutdownHooks();return boolean(env,true);}
static void cleanup(void*){stop();shutdownHooks();}
NAPI_MODULE_INIT() {
 const napi_property_descriptor properties[]={{"status",nullptr,status,nullptr,nullptr,nullptr,napi_default,nullptr},{"begin",nullptr,begin,nullptr,nullptr,nullptr,napi_default,nullptr},{"apply",nullptr,apply,nullptr,nullptr,nullptr,napi_default,nullptr},{"end",nullptr,end,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(env,exports,4,properties);napi_add_env_cleanup_hook(env,cleanup,nullptr);return exports;
}
