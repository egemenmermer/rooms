import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const launch=async()=>{const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),ROOMS_PROFILE:`qa-${randomUUID()}`};delete env.ELECTRON_RUN_AS_NODE;return electron.launch({args:['.'],env});};
test('desktop shell isolates native APIs and plays actual local media',async()=>{
  const app=await launch();console.log('Shell launched');try{const page=await app.firstWindow();await page.waitForSelector('.hero');
    expect(await page.evaluate(()=>({node:typeof (window as any).require,platform:(window as any).rooms.platform}))).toEqual({node:'undefined',platform:process.platform});
    console.log('Bridge isolated');await expect(page.evaluate(()=>(window as any).rooms.windowAction('invalid'))).rejects.toThrow();
    console.log('Invalid IPC rejected');await page.keyboard.press('Meta+k');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    console.log('Command menu checked');await page.getByRole('button',{name:'Sinemaya gir',exact:true}).click();await page.getByRole('button',{name:'Mavi saati oynat',exact:true}).click();
    await page.waitForFunction(()=>{const v=document.querySelector('video');return !!v&&!v.paused&&v.currentTime>0;});
    expect(await page.locator('video').evaluate(v=>(v as HTMLVideoElement).duration)).toBe(30);
    await page.getByRole('button',{name:'Videoyu duraklat',exact:true}).click();await page.getByRole('slider',{name:'Oynatma konumu',exact:true}).fill('12');expect(await page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeCloseTo(12,0);
    console.log('Playback and seek checked');await page.getByRole('button',{name:'Sinemayı tam ekran yap',exact:true}).click();await expect(page.locator('.native-fullscreen')).toBeVisible();await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);await page.getByRole('button',{name:'Tam ekrandan çık',exact:true}).click();await expect(page.locator('.native-fullscreen')).toHaveCount(0);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
    const metrics=await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,workingSetKB:p.memory.workingSetSize,cpuPercent:p.cpu.percentCPUUsage})));console.log(JSON.stringify({desktopMetrics:metrics}));
  }finally{await app.close();}
});
test('two real Stoat desktop accounts exchange events and join one authorized room',async()=>{
  test.skip(!process.env.ROOMS_STOAT_DESKTOP_FIXTURES, 'Requires actual Stoat accounts; legacy Spacebar fixtures are not Stoat verification.');
  const fixtures=JSON.parse(await readFile(process.env.ROOMS_STOAT_DESKTOP_FIXTURES!,'utf8'));const apps:ElectronApplication[]=[];
  try{for(const who of ['owner','guest']){const app=await launch();apps.push(app);const page=await app.firstWindow();await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');await page.waitForSelector('.social-connection');
    await page.getByRole('textbox',{name:'Topluluk sunucu adresi'}).fill(fixtures.base);await page.getByRole('textbox',{name:'Hesap e-postası'}).fill(fixtures[who].email);await page.getByRole('textbox',{name:'Hesap parolası'}).fill(fixtures[who].password);await page.getByRole('button',{name:'İçeri gel',exact:true}).click();await page.waitForSelector('.signed-in-profile');await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('[aria-label="Community message composer"]');}
    const owner=await apps[0].firstWindow(),guest=await apps[1].firstWindow();const text=`Desktop acceptance ${randomUUID()}`;
    await owner.getByRole('textbox',{name:'Topluluk mesajı yaz'}).fill(text);await owner.keyboard.press('Enter');await expect(guest.getByText(text,{exact:true})).toBeVisible({timeout:15000});
    for(const page of [owner,guest]){await page.evaluate(()=>location.hash='/voice');await page.waitForSelector('.real-voice-channels');await page.locator('.real-voice-channels>button').first().click();await page.waitForFunction(()=>document.querySelector('.real-voice-dock small')?.textContent?.includes('in the room'));}
    const channelId=fixtures.voiceId;
    const reservations=await Promise.allSettled([owner.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId),guest.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId)]);expect(reservations.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const winner=reservations[0].status==='fulfilled'?owner:guest,other=winner===owner?guest:owner;await winner.evaluate(id=>(window as any).rooms.media.presenter(id,'release'),channelId);await other.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId);await other.evaluate(id=>(window as any).rooms.media.presenter(id,'release'),channelId);
    await owner.evaluate(()=>location.hash='/cinema');await owner.waitForSelector('.cinema-stage');await expect(owner.getByRole('button',{name:'Ses odasından ayrıl',exact:true})).toBeVisible();
    for(const page of [owner,guest])await page.getByRole('button',{name:'Ses odasından ayrıl',exact:true}).click();
    await expect(owner.locator('.real-voice-dock')).toHaveCount(0);
    console.log('PASS: distinct native sessions, actual gateway delivery, broker-authorized voice and persistent Cinema voice. Physical capture not exercised.');
  }finally{for(const app of apps)await app.close();}
});
