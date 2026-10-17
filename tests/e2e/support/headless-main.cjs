/**
 * Test-only Electron main-process hook, loaded with NODE_OPTIONS=--require by the e2e client.
 *
 * Electron has no true headless mode, so windows stay "visible" to Chromium (rendering, timers
 * and WebRTC are not throttled) but are invisible to the person at the computer: shown without
 * activation, fully transparent, ignoring the real mouse, and absent from the Dock, the app
 * switcher and the menu bar. Playwright drives them through CDP, not OS input.
 */
const electron = require('electron');
const { app, BrowserWindow, nativeImage } = electron;

const hide = (win) => {
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true);
  win.setSkipTaskbar(true);
  win.webContents.setBackgroundThrottling(false);
};

BrowserWindow.prototype.show = function show() {
  hide(this);
  this.showInactive();
};
BrowserWindow.prototype.focus = function focus() {};
app.on('browser-window-created', (_event, win) => hide(win));

// The tray icon would add one menu bar item per client; give it an empty image instead.
try {
  const RealTray = electron.Tray;
  class HiddenTray extends RealTray {
    constructor() {
      super(nativeImage.createEmpty());
    }
    setImage() {}
    setPressedImage() {}
    setTitle() {}
  }
  Object.defineProperty(electron, 'Tray', { value: HiddenTray, configurable: true });
} catch {
  // A tray icon per client is cosmetic; windows stay hidden either way.
}

app.on('will-finish-launching', () => {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
});
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
    app.dock?.hide();
  }
});
