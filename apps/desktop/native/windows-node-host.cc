// Electron exports N-API from the executable (ROOMS.exe after packaging).
// Resolve delayed node.exe imports to that host, never to a separate Node runtime.
// https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
#include <windows.h>
#include <delayimp.h>
#include <cstring>

static FARPROC WINAPI ResolveNodeHost(unsigned notification, PDelayLoadInfo info) {
  if (notification == dliNotePreLoadLibrary && info &&
      (_stricmp(info->szDll, "node.exe") == 0 || _stricmp(info->szDll, "node.dll") == 0))
    return reinterpret_cast<FARPROC>(GetModuleHandleW(nullptr));
  return nullptr;
}
extern "C" const PfnDliHook __pfnDliNotifyHook2 = ResolveNodeHost;
