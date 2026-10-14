// Actual PersonalPlaybackRuntime and native IPC, with an isolated, labeled synthetic authority.
// Never accesses the owner's accounts, provider vault or installed application.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { build as viteBuild, loadConfigFromFile } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.');
const out = resolve('.local/vlc-ui-check');
await mkdir(out, { recursive: true });
const url = 'rooms-provider://11111111-1111-4111-8111-111111111111/stream';
await writeFile(
  join(out, 'renderer.tsx'),
  `
import React from 'react';import {createRoot} from 'react-dom/client';import {HashRouter,Link} from 'react-router-dom';
import {PersonalPlaybackRuntime} from '${root}/apps/desktop/src/PersonalMedia';
import {startPersonalPlayback} from '${root}/apps/desktop/src/personal-playback';
import {useCommunity} from '${root}/apps/desktop/src/community';
import '${root}/apps/desktop/src/styles.css';import '${root}/apps/desktop/src/reference-tokens.css';import '${root}/apps/desktop/src/reference-shell.css';
useCommunity.setState({user:{id:'qa-owner',username:'QA',displayName:'QA',avatar:null},serverUrl:'https://example.test'});
startPersonalPlayback({url:${JSON.stringify(url)},name:'VLC — yerel test yayını',live:true},'qa-connection','qa-owner','https://example.test');
createRoot(document.getElementById('root')!).render(<HashRouter><div className="app personal-media-mode"><div className="window-chrome">Yerel test · gerçek IPTV hesabı değil</div><div className="app-layout"><aside className="sidebar" style={{width:240}}><h2>Yerel kontrol</h2><Link to="/chat">Sohbete geç</Link><Link to="/media?player=1">Oynatıcıyı göster</Link></aside><main className="workspace"><PersonalPlaybackRuntime notify={message=>console.log(message)}/></main></div></div></HashRouter>);
`,
);
await writeFile(
  join(out, 'index.html'),
  '<!doctype html><html lang="tr"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="./renderer.tsx"></script></body></html>',
);
const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  resolve('vite.config.ts'),
);
if (!loaded) throw new Error('Vite configuration unavailable.');
await viteBuild({
  ...loaded.config,
  configFile: false,
  root: out,
  publicDir: join(root, 'apps/desktop/public'),
  build: { outDir: join(out, 'ui'), emptyOutDir: true },
  logLevel: 'error',
});
await writeFile(
  join(out, 'preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('rooms',{providers:{status:async()=>[{id:'qa-connection'}],epg:async()=>[],acknowledgePlayback:async()=>{},nativePlayer:{status:()=>ipcRenderer.invoke('rooms:provider-native-status'),start:url=>ipcRenderer.invoke('rooms:provider-native-start',url),state:token=>ipcRenderer.invoke('rooms:provider-native-state',token),bounds:(token,rect)=>ipcRenderer.invoke('rooms:provider-native-bounds',token,rect),control:(token,input)=>ipcRenderer.invoke('rooms:provider-native-control',token,input),stop:token=>ipcRenderer.invoke('rooms:provider-native-stop',token)}}});`,
);
await writeFile(
  join(out, 'main.ts'),
  `
import {app,BrowserWindow} from 'electron';import {readFileSync} from 'node:fs';import {setupPersonalVLC} from '${root}/apps/desktop/electron/personal-vlc';
app.setPath('userData',${JSON.stringify(join(out, 'profile'))});
app.whenReady().then(async()=>{
 const data=readFileSync(${JSON.stringify(resolve('.local/vlc-native-check/sample.avi'))});let win:BrowserWindow|null=new BrowserWindow({title:'ROOMS — VLC yerel kontrol',width:1100,height:800,show:true,webPreferences:{sandbox:true,preload:__dirname+'/preload.cjs'}});
 const authority={authorizePlayback:(url:string)=>{if(url!==${JSON.stringify(url)})throw Error('Unowned source');return()=>{};},onPlaybackRevoked:()=>()=>{},fetchPlayback:async(request:Request)=>{const range=request.headers.get('range');const start=range?Number(range.match(/bytes=(\\d+)/)![1]):0;return new Response(data.subarray(start),{status:range?206:200,headers:{'Content-Type':'video/x-msvideo','Content-Length':String(data.length-start),...(range?{'Content-Range':'bytes '+start+'-'+(data.length-1)+'/'+data.length,'Accept-Ranges':'bytes'}:{'Accept-Ranges':'bytes'})}});}};
 const player=setupPersonalVLC(event=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted sender');},()=>win,authority as never,${JSON.stringify(join(root, 'dist-native'))});
 app.on('before-quit',()=>{void player.close();});await win.loadFile(__dirname+'/ui/index.html',{hash:'/media?player=1'});
});
`,
);
await build({
  entryPoints: [join(out, 'main.ts')],
  outfile: join(out, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [join(out, 'main.cjs')], env });
const result = {
  scope:
    'Actual player UI/native IPC; synthetic account/source; excludes real provider and physical second device',
  status: 'FAIL',
  platform: process.platform,
};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('QA renderer: ' + message.text());
  });
  await page.getByRole('button', { name: 'Duraklat', exact: true }).waitFor({ timeout: 120000 });
  assert.equal(await page.locator('video').getAttribute('src'), null);
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await page.getByRole('button', { name: 'Oynat', exact: true }).waitFor();
  await page.getByRole('slider', { name: 'Yayın ses düzeyi' }).fill('0');
  await page.getByRole('button', { name: 'Ses ve altyazı', exact: true }).last().click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('link', { name: 'Sohbete geç' }).click();
  await page.getByRole('button', { name: 'Oynatıcıya dön', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Oynatıcıya dön', exact: true }).click();
  await page.getByRole('button', { name: 'Oynat', exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.__qaEntered = false;
    BrowserWindow.getAllWindows()[0].once('enter-full-screen', () => {
      globalThis.__qaEntered = true;
    });
  });
  await page.getByRole('button', { name: 'Tam ekran', exact: true }).click();
  await app.evaluate(async () => {
    const started = Date.now();
    while (!globalThis.__qaEntered) {
      if (Date.now() - started > 10000)
        throw Error('Native fullscreen transition did not complete');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  const win = await app.browserWindow(page);
  await win.evaluate((w) => w.setSize(900, 700));
  await page.screenshot({ path: join(out, 'player-900.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(errors.length, 0);
  result.status = 'PASS';
  result.checks = [
    'native first-frame enables controls',
    'no duplicate HTML source',
    'pause',
    'volume',
    'options/Escape',
    'route hide/return retains playback',
    'fullscreen/Escape',
    '900×700 no document horizontal overflow',
  ];
  if (process.env.ROOMS_VLC_QA_KEEP_OPEN === '1') {
    console.log(
      'VLC UI checks passed; isolated window left open for native-surface visual inspection.',
    );
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
} finally {
  await app.close();
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
