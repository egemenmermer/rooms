import { setupPersonalVLC } from './personal-vlc';
import { isolatedProfilePath } from './profile';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  Tray,
  screen,
  shell,
} from 'electron';
import { readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localMediaId } from './media-capabilities';
import { readCaptionFile } from './caption-file';
import { Readable } from 'node:stream';
import { setupCommunity } from './community';
import { setupNotifications } from './notifications';
import { setupWindowPolicy } from './window-policy';
import { setupUpdates } from './updates';
import { setupProviders } from './providers';
import { parseInviteLink, type InviteLink } from './native-links';
import { setupAgent } from './agent';
import { whiteboardSvg } from './whiteboard-export';
import { whiteboardPng } from './whiteboard-raster';
import type { ActivityResponse } from '@rooms/activity-protocol';
const isolatedProfile = isolatedProfilePath(app.getPath('appData'), process.env.ROOMS_PROFILE);
if (isolatedProfile) app.setPath('userData', isolatedProfile);
let win: BrowserWindow | null = null;
let quitting = false;
let windowPolicy: ReturnType<typeof setupWindowPolicy> | null = null;
app.on('before-quit', () => {
  quitting = true;
});
let pendingInvite: InviteLink | null = null;
function receiveLink(raw: string) {
  const invite = parseInviteLink(raw);
  if (!invite) return;
  pendingInvite = invite;
  if (win) {
    win.show();
    win.focus();
    win.webContents.send('rooms:invite-link', invite);
  }
}
app.on('open-url', (event, url) => {
  event.preventDefault();
  receiveLink(url);
});
let primaryInstance = true;
if (app.isPackaged && !process.env.ROOMS_PROFILE) {
  if (!app.requestSingleInstanceLock()) {
    primaryInstance = false;
    app.quit();
  } else
    app.on('second-instance', (_event, argv) => {
      const link = argv.find((arg) => arg.startsWith('rooms://'));
      if (link) receiveLink(link);
      else win?.show();
    });
}
const startupLink = process.argv.find((arg) => arg.startsWith('rooms://'));
if (startupLink) receiveLink(startupLink);
app.setName('ROOMS');
let tray: Tray | null = null;
const selectedMedia = new Map<string, string>();
const devUrl =
  process.env.ROOMS_DEV_URL === 'http://127.0.0.1:5173' ? process.env.ROOMS_DEV_URL : undefined;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'rooms-provider',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'rooms-media',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
  },
]);
function isTrusted(url: string) {
  try {
    return devUrl
      ? new URL(url).origin === devUrl
      : url.startsWith('file://') &&
          url.split('#')[0] === new URL(`file://${join(__dirname, '../dist/index.html')}`).href;
  } catch {
    return false;
  }
}
function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    !isTrusted(event.senderFrame.url)
  )
    throw new Error('Untrusted IPC sender');
}
function createWindow() {
  let bounds: { width: number; height: number; x?: number; y?: number } = {
    width: 1440,
    height: 900,
  };
  try {
    const saved = JSON.parse(readFileSync(join(app.getPath('userData'), 'window.json'), 'utf8'));
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      const display = screen.getDisplayMatching({
        x: Number.isFinite(saved.x) ? saved.x : 0,
        y: Number.isFinite(saved.y) ? saved.y : 0,
        width: saved.width,
        height: saved.height,
      }).workArea;
      bounds = {
        width: Math.min(display.width, Math.max(900, saved.width)),
        height: Math.min(display.height, Math.max(700, saved.height)),
      };
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        bounds.x = Math.max(display.x, Math.min(saved.x, display.x + display.width - bounds.width));
        bounds.y = Math.max(
          display.y,
          Math.min(saved.y, display.y + display.height - bounds.height),
        );
      }
    }
  } catch {
    /* First launch. */
  }
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 700,
    backgroundColor: '#141518',
    show: false,
    title: 'ROOMS',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 8 },
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#141518', symbolColor: '#F2F3F7', height: 30 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Chat links open in the user's browser; the app window never hosts external pages.
    if (/^https?:\/\//i.test(url) && url.length <= 2048) {
      try {
        const parsed = new URL(url);
        if (!parsed.username && !parsed.password) void shell.openExternal(parsed.href);
      } catch {
        /* Malformed links are ignored. */
      }
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrusted(url)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.once('ready-to-show', () => win?.show());
  windowPolicy?.attach(win);
  win.on('close', () => {
    if (win && !win.isFullScreen()) {
      const { width, height, x, y } = win.getNormalBounds();
      writeFileSync(
        join(app.getPath('userData'), 'window.json'),
        JSON.stringify({ width, height, x, y }),
      );
    }
  });
  win.on('closed', () => {
    win = null;
    selectedMedia.clear();
  });
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../dist/index.html'));
}
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  const notifications = setupNotifications(
    () => win,
    assertSender,
    () => {
      const scope = community.snapshot();
      return scope.user && scope.instanceUrl
        ? { serverUrl: scope.instanceUrl, userId: scope.user.id }
        : null;
    },
  );
  windowPolicy = setupWindowPolicy(
    assertSender,
    () => !!tray && !tray.isDestroyed(),
    notifications.voiceActive,
    () => quitting,
  );
  const community = await setupCommunity(() => win, assertSender, isTrusted, notifications.message);
  const providers = setupProviders(
    assertSender,
    () => {
      const scope = community.snapshot();
      return `${scope.sessionEpoch ?? 0}:${scope.instanceUrl ?? ''}:${scope.user?.id ?? ''}`;
    },
    () => {
      const scope = community.snapshot();
      return scope.user && scope.instanceUrl
        ? JSON.stringify([scope.instanceUrl, scope.user.id])
        : null;
    },
  );
  const personalVLC = setupPersonalVLC(assertSender, () => win, providers);
  app.on('before-quit', () => {
    void personalVLC.close();
  });
  setupUpdates(assertSender);
  setupAgent(
    () => win,
    assertSender,
    () => community.snapshot().user?.id ?? null,
  );
  ipcMain.handle('rooms:activity-snapshot', (event, roomId, afterRevision) => {
    assertSender(event);
    return community.activityRequest(roomId, undefined, afterRevision);
  });
  ipcMain.handle('rooms:activity-command', (event, roomId, command) => {
    assertSender(event);
    return community.activityRequest(roomId, command);
  });
  app.on('before-quit', () => providers.clearPlayback());
  ipcMain.handle('rooms:youtube-details', async (event, videoId) => {
    assertSender(event);
    if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId))
      throw new Error('Invalid YouTube video identifier.');
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    endpoint.searchParams.set('format', 'json');
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      });
      // oEmbed answers 401 when the owner disallows embedding and 404 for private/removed videos.
      if (response.status === 401 || response.status === 403 || response.status === 404)
        return { playable: false };
      if (!response.ok) return null;
      const value = (await response.json()) as { title?: unknown; author_name?: unknown };
      const title = typeof value.title === 'string' ? value.title.trim().slice(0, 240) : '';
      const author =
        typeof value.author_name === 'string' ? value.author_name.trim().slice(0, 120) : '';
      return title ? { title, author, playable: true } : null;
    } catch {
      return null;
    }
  });
  ipcMain.handle('rooms:youtube-player', (event, videoId, chrome) => {
    assertSender(event);
    if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId))
      throw new Error('Invalid YouTube video identifier.');
    if (chrome !== undefined && chrome !== 'minimal' && chrome !== 'native')
      throw new Error('Invalid YouTube player style.');
    const instance = community.snapshot().instanceUrl;
    if (!instance) throw new Error('Connect the community server first.');
    const origin = new URL(instance).origin;
    if (!origin.startsWith('https://'))
      throw new Error(
        'YouTube requires the deployed HTTPS player origin. Local viewing has not been verified.',
      );
    const nonce = randomUUID();
    return {
      url: `${origin}/rooms-activities/player/youtube?videoId=${videoId}&nonce=${nonce}${chrome === 'minimal' ? '&chrome=minimal' : ''}`,
      nonce,
    };
  });
  ipcMain.handle('rooms:youtube-playlist', (event, playlistId) => {
    assertSender(event);
    if (typeof playlistId !== 'string' || !/^[a-zA-Z0-9_-]{10,128}$/.test(playlistId))
      throw new Error('Invalid YouTube playlist identifier.');
    const instance = community.snapshot().instanceUrl;
    if (!instance) throw new Error('Connect the community server first.');
    const origin = new URL(instance).origin;
    if (!origin.startsWith('https://'))
      throw new Error('YouTube requires the deployed HTTPS player origin.');
    const nonce = randomUUID();
    return {
      url: `${origin}/rooms-activities/player/youtube?playlistId=${encodeURIComponent(playlistId)}&nonce=${nonce}`,
      nonce,
    };
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      details.isMainFrame &&
        isTrusted(details.requestingUrl) &&
        contents === win?.webContents &&
        isTrusted(contents.getURL()) &&
        (permission === 'media' ||
          permission === 'fullscreen' ||
          permission === 'clipboard-sanitized-write'),
    ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      details.isMainFrame &&
      !!details.requestingUrl &&
      isTrusted(details.requestingUrl) &&
      contents === win?.webContents &&
      (permission === 'media' ||
        permission === 'fullscreen' ||
        permission === 'clipboard-sanitized-write') &&
      isTrusted(contents.getURL()),
  );
  protocol.handle('rooms-media', (request) => {
    const id = new URL(request.url).hostname;
    const path = selectedMedia.get(id);
    if (!path) return new Response('Media access expired. Choose the file again.', { status: 404 });
    try {
      const size = statSync(path).size;
      const range = request.headers.get('range');
      const match = range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || end < start)
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const mime = path.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : path.toLowerCase().endsWith('.ogg')
          ? 'video/ogg'
          : 'video/mp4';
      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      };
      if (match) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      return new Response(
        Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream,
        { status: match ? 206 : 200, headers },
      );
    } catch {
      return new Response('The selected file is unavailable.', { status: 404 });
    }
  });
  ipcMain.handle('rooms:pending-invite', (event) => {
    assertSender(event);
    const invite = pendingInvite;
    pendingInvite = null;
    return invite;
  });
  ipcMain.handle('rooms:window', (event, action) => {
    assertSender(event);
    if (action === 'minimize') win?.minimize();
    else if (action === 'maximize') win?.isMaximized() ? win.unmaximize() : win?.maximize();
    else if (action === 'close') win?.close();
    else if (action === 'fullscreen') win?.setFullScreen(!win.isFullScreen());
    else throw new Error('Unknown window action');
  });
  ipcMain.handle('rooms:always-on-top', (event, value) => {
    assertSender(event);
    if (typeof value !== 'boolean') throw new Error('Invalid value');
    win?.setAlwaysOnTop(value);
  });
  ipcMain.handle('rooms:login-item-status', (event) => {
    assertSender(event);
    return app.isPackaged && app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('rooms:login-item', (event, value) => {
    assertSender(event);
    if (typeof value !== 'boolean') throw new Error('Invalid value');
    if (!app.isPackaged) return false;
    app.setLoginItemSettings({ openAtLogin: value });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('rooms:choose-media', async (event) => {
    assertSender(event);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose your own media',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'm4v'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    selectedMedia.clear();
    const id = randomUUID();
    selectedMedia.set(id, result.filePaths[0]);
    return { url: `rooms-media://${id}/video`, name: basename(result.filePaths[0]) };
  });
  ipcMain.handle('rooms:release-media', (event, url) => {
    assertSender(event);
    selectedMedia.delete(localMediaId(url));
  });
  ipcMain.handle('rooms:choose-caption', async (event, mediaUrl) => {
    assertSender(event);
    const id = localMediaId(mediaUrl);
    const sourcePath = selectedMedia.get(id);
    if (!sourcePath || !win) throw new Error('Choose your own local video first.');
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose your own subtitles',
      properties: ['openFile'],
      filters: [{ name: 'WebVTT subtitles', extensions: ['vtt'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    if (selectedMedia.get(id) !== sourcePath)
      throw new Error('The selected video changed. Choose subtitles again.');
    return { content: readCaptionFile(result.filePaths[0]), name: basename(result.filePaths[0]) };
  });
  ipcMain.handle('rooms:external-media', async (event, url) => {
    assertSender(event);
    if (typeof url !== 'string') throw new Error('Invalid media selection.');
    const parsed = new URL(url);
    if (parsed.protocol !== 'rooms-media:') throw new Error('Choose your own local media first.');
    const path = selectedMedia.get(parsed.hostname);
    if (!path) throw new Error('The selected media access expired. Choose the file again.');
    return (await shell.openPath(path)) === '';
  });
  const diagnosticsPreview = () =>
    JSON.stringify(
      {
        app: 'ROOMS',
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        social: community.snapshot().status,
        mode: community.snapshot().user ? 'authenticated' : 'signed-out',
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );
  ipcMain.handle('rooms:application-info', (event) => {
    assertSender(event);
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
    };
  });
  ipcMain.handle('rooms:diagnostics-preview', (event) => {
    assertSender(event);
    return diagnosticsPreview();
  });
  ipcMain.handle('rooms:third-party-notices', (event) => {
    assertSender(event);
    const file = join(__dirname, '../dist/THIRD_PARTY_NOTICES.txt');
    if (statSync(file).size > 2_000_000) throw new Error('The bundled notices are too large.');
    return readFileSync(file, 'utf8');
  });
  ipcMain.handle('rooms:export-diagnostics', async (event) => {
    assertSender(event);
    if (!win) return false;
    const result = await dialog.showSaveDialog(win, {
      title: 'Export sanitized diagnostics',
      defaultPath: 'rooms-diagnostics.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, diagnosticsPreview());
    return true;
  });
  ipcMain.handle('rooms:export-board', async (event, roomId, requestedFormat) => {
    assertSender(event);
    if (!win) return false;
    if (devUrl && new URL(event.senderFrame!.url).searchParams.has('fixture'))
      throw new Error('File export is disabled in development fixtures.');
    const format = requestedFormat === undefined ? 'svg' : requestedFormat;
    if (format !== 'svg' && format !== 'png') throw new Error('Unsupported artwork format.');
    // Membership and session are checked by the existing native Activity adapter.
    const state = (await community.activityRequest(roomId)) as ActivityResponse;
    const artwork = whiteboardSvg(state.room.whiteboard);
    const identity = community.snapshot().user?.id;
    const serverUrl = community.snapshot().instanceUrl;
    const image = format === 'png' ? await whiteboardPng(artwork) : null;
    const result = await dialog.showSaveDialog(win, {
      title: 'Save shared whiteboard',
      defaultPath: `rooms-whiteboard.${format}`,
      filters: [{ name: format === 'png' ? 'PNG image' : 'SVG image', extensions: [format] }],
    });
    if (result.canceled || !result.filePath) return false;
    if (
      !identity ||
      community.snapshot().user?.id !== identity ||
      community.snapshot().instanceUrl !== serverUrl
    )
      throw new Error('The community session changed.');
    await community.activityRequest(roomId);
    if (
      community.snapshot().user?.id !== identity ||
      community.snapshot().instanceUrl !== serverUrl
    )
      throw new Error('The community session changed.');
    if (image) writeFileSync(result.filePath, image, { mode: 0o600 });
    else writeFileSync(result.filePath, artwork, { encoding: 'utf8', mode: 0o600 });
    return true;
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'ROOMS',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
  createWindow();
  if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../dist/icon.png'));
  const icon = nativeImage.createFromPath(join(__dirname, '../dist/tray.png'));
  icon.setTemplateImage(true);
  if (!icon.isEmpty()) {
    tray = new Tray(icon);
    tray.setToolTip('ROOMS');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'ROOMS’u aç',
          click: () => {
            if (win) win.show();
            else createWindow();
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ]),
    );
  }
  app.on('activate', () => {
    if (!win) createWindow();
    else win.show();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
