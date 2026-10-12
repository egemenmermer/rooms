import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const launch=async()=>{const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),ROOMS_PROFILE:`qa-${randomUUID()}`};delete env.ELECTRON_RUN_AS_NODE;return electron.launch({args:['.'],env});};
test('desktop shell isolates native APIs and supports current signed-out onboarding',async()=>{
 const app=await launch();const profile=await app.evaluate(({app})=>app.getPath('userData'));
 try{
  const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'Giriş',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({node:typeof (window as any).require,platform:(window as any).rooms.platform}))).toEqual({node:'undefined',platform:process.platform});
  await expect(page.evaluate(()=>(window as any).rooms.windowAction('invalid'))).rejects.toThrow();
  await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
  await expect(page.getByLabel('E-posta adresi')).toBeVisible();await expect(page.getByPlaceholder('Şifren',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Davetle hesap oluştur',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hesap oluştur',exact:true})).toBeVisible();await expect(page.getByLabel('Topluluk davet kodu',{exact:true})).toBeVisible();
  await page.evaluate(()=>location.hash='/setup/invite');await expect(page.getByRole('heading',{name:'Topluluk daveti'})).toBeVisible();
  await page.getByLabel('Davet kodu',{exact:true}).fill('!!!');await page.getByRole('button',{name:'Davetimi aç',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible(); // Native syntax rejection, no signup or valid invitation consumption.
  await page.evaluate(()=>location.hash='/settings?tab=appearance');await expect(page.getByRole('heading',{name:'Görünüm ve erişilebilirlik',exact:true})).toBeVisible();
  await page.getByRole('switch',{name:'Hareketi azalt',exact:true}).click();await expect(page.getByRole('region',{name:'Kaydedilmemiş ayarlar'})).toBeVisible();
  await page.getByRole('button',{name:'Vazgeç',exact:true}).click();await expect(page.getByRole('region',{name:'Kaydedilmemiş ayarlar'})).toHaveCount(0);
  await page.getByRole('button',{name:'Ayarları kapat',exact:true}).click();
  await page.evaluate(()=>location.hash='/cinema');await expect(page.getByRole('heading',{name:'Cinema',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Kaynağımı seç',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Paylaşımı hazırla',exact:true})).toBeDisabled();await expect(page.locator('video')).toHaveCount(0);
  await page.evaluate(()=>location.hash='/chat');await expect(page.locator('.chat-transcript')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Maya');await expect(page.locator('audio,video')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});
test('two real Stoat desktop accounts exchange events and join one authorized room',async()=>{
  test.skip(!process.env.ROOMS_STOAT_DESKTOP_FIXTURES, 'Requires actual Stoat accounts; legacy Spacebar fixtures are not Stoat verification.');
  const fixtures=JSON.parse(await readFile(process.env.ROOMS_STOAT_DESKTOP_FIXTURES!,'utf8'));
  if(fixtures.disposable!==true||!fixtures.spaceId||!fixtures.spaceName||!fixtures.textId||!fixtures.voiceId)throw new Error('Authenticated acceptance requires explicitly disposable QA community/channel fixtures.');
  const apps:ElectronApplication[]=[],profiles:string[]=[];
  try{for(const who of ['owner','guest']){
    const app=await launch();apps.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));
    const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'Giriş',exact:true})).toBeVisible();await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
    await page.getByText('Sunucu ve davet seçenekleri',{exact:true}).click();await page.getByLabel('Sunucu adresi',{exact:true}).fill(fixtures.base);
    await page.getByLabel('E-posta adresi').fill(fixtures[who].email);await page.getByPlaceholder('Şifren',{exact:true}).fill(fixtures[who].password);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Profil',exact:true})).toBeVisible();
    await page.evaluate(()=>location.hash='/home');await page.getByRole('button',{name:`${fixtures.spaceName} mekânını aç`,exact:true}).click();
    await page.locator(`[data-channel-id="${fixtures.textId}"]`).click();await expect(page.getByRole('textbox',{name:'Topluluk mesajı yaz'})).toBeVisible();
  }
    const owner=await apps[0].firstWindow(),guest=await apps[1].firstWindow();const text=`Desktop acceptance ${randomUUID()}`;
    await owner.getByRole('textbox',{name:'Topluluk mesajı yaz'}).fill(text);await owner.keyboard.press('Enter');await expect(guest.getByText(text,{exact:true})).toBeVisible({timeout:15000});
    for(const page of [owner,guest]){await page.locator(`[data-channel-id="${fixtures.voiceId}"]`).click();await expect(page.getByText('Ses bağlı',{exact:true})).toBeVisible();}
    const channelId=fixtures.voiceId;
    const reservations=await Promise.allSettled([owner.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId),guest.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId)]);expect(reservations.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const winner=reservations[0].status==='fulfilled'?owner:guest,other=winner===owner?guest:owner;await winner.evaluate(id=>(window as any).rooms.media.presenter(id,'release'),channelId);await other.evaluate(id=>(window as any).rooms.media.presenter(id,'acquire'),channelId);await other.evaluate(id=>(window as any).rooms.media.presenter(id,'release'),channelId);
    await owner.evaluate(()=>location.hash='/cinema');await expect(owner.getByRole('heading',{name:'Cinema',exact:true})).toBeVisible();await expect(owner.getByRole('button',{name:'Sesten ayrıl',exact:true}).first()).toBeVisible();
    for(const page of [owner,guest])await page.getByRole('button',{name:'Sesten ayrıl',exact:true}).first().click();
    await expect(owner.locator('.real-voice-dock')).toHaveCount(0);
    console.log('PASS: distinct native sessions, actual gateway delivery, broker-authorized voice and persistent Cinema voice. Physical capture not exercised.');
  }finally{for(const app of apps)await app.close();for(const profile of profiles)await rm(profile,{recursive:true,force:true});}
});
