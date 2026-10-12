import {afterEach,describe,expect,it,vi} from 'vitest';
import {StoatClient} from '../packages/stoat-adapter/src/index';

const configuration = (email=true, required=false, key='') => new Response(JSON.stringify({features:{email,captcha:{enabled:required,key}}}),{status:200});
const noContent = () => new Response(null,{status:204});
const client = () => new StoatClient('https://social.example','existing-private-session');
afterEach(()=>vi.unstubAllGlobals());
describe('Stoat recovery adapter (local mocked upstream; no email delivery claims)',()=>{
  it('reads only public recovery/captcha configuration with no session',async()=>{
    const fetch=vi.fn().mockResolvedValue(configuration(true,true,'public-site-key'));vi.stubGlobal('fetch',fetch);
    await expect(client().passwordRecoveryCapabilities()).resolves.toEqual({emailEnabled:true,captcha:{required:true,siteKey:'public-site-key'}});
    const [url,init]=fetch.mock.calls[0];expect(url).toBe('https://social.example/api');expect(init.method).toBe('GET');expect(init.headers).toEqual({'Content-Type':'application/json'});expect(init.credentials).toBe('omit');expect(init.redirect).toBe('error');expect(init.cache).toBe('no-store');expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('uses official POST body and returns non-enumerating acceptance only',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(configuration()).mockResolvedValueOnce(noContent());vi.stubGlobal('fetch',fetch);
    await expect(client().requestPasswordRecovery({email:'friend@example.com'})).resolves.toEqual({accepted:true});
    const [url,init]=fetch.mock.calls[1];expect(url).toBe('https://social.example/api/auth/account/reset_password');expect(init.method).toBe('POST');expect(JSON.parse(init.body)).toEqual({email:'friend@example.com'});expect(init.headers).not.toHaveProperty('x-session-token');expect(init.headers).not.toHaveProperty('x-bot-token');
  });
  it('fails closed before sending an absent required captcha',async()=>{
    const fetch=vi.fn().mockResolvedValue(configuration(true,true,'public-site-key'));vi.stubGlobal('fetch',fetch);
    await expect(client().requestPasswordRecovery({email:'friend@example.com'})).rejects.toMatchObject({code:'PASSWORD_RECOVERY_CAPTCHA_REQUIRED'});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('forwards a supplied captcha token without bypassing upstream verification',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(configuration(true,true,'public-site-key')).mockResolvedValueOnce(noContent());vi.stubGlobal('fetch',fetch);
    await client().requestPasswordRecovery({email:'friend@example.com',captcha:'fixture-captcha'});expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({email:'friend@example.com',captcha:'fixture-captcha'});
  });
  it('does not imply success when SMTP is disabled or configuration is unknown',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(configuration(false)).mockResolvedValueOnce(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetch);
    await expect(client().requestPasswordRecovery({email:'friend@example.com'})).rejects.toMatchObject({code:'PASSWORD_RECOVERY_EMAIL_UNAVAILABLE'});
    await expect(client().requestPasswordRecovery({email:'friend@example.com'})).rejects.toMatchObject({code:'INVALID_PASSWORD_RECOVERY_CONFIGURATION'});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uses official PATCH body with session invalidation enabled by default',async()=>{
    const fetch=vi.fn().mockResolvedValue(noContent());vi.stubGlobal('fetch',fetch);const c=client();
    await expect(c.confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password'})).resolves.toEqual({completed:true});
    expect(fetch.mock.calls[0][0]).toBe('https://social.example/api/auth/account/reset_password');expect(fetch.mock.calls[0][1].method).toBe('PATCH');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({token:'fixture-reset-token',password:'new-fixture-password',remove_sessions:true});expect(c.getToken()).toBe('existing-private-session');
  });
  it('respects explicitly chosen session retention',async()=>{
    const fetch=vi.fn().mockResolvedValue(noContent());vi.stubGlobal('fetch',fetch);
    await client().confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password',removeSessions:false});expect(JSON.parse(fetch.mock.calls[0][1].body).remove_sessions).toBe(false);
  });
  it('validates bounded inputs before any network operation',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(client().requestPasswordRecovery({email:'invalid'})).rejects.toMatchObject({status:400});
    await expect(client().requestPasswordRecovery({email:'friend@example.com',captcha:'x'.repeat(4097)})).rejects.toMatchObject({status:400});
    await expect(client().confirmPasswordRecovery({token:'x'.repeat(513),password:'new-fixture-password'})).rejects.toMatchObject({status:400});
    await expect(client().confirmPasswordRecovery({token:'fixture-reset-token',password:'short'})).rejects.toMatchObject({status:400});expect(fetch).not.toHaveBeenCalled();
  });
  it('does not accept undocumented successful statuses',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:200})));
    await expect(client().confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password'})).rejects.toMatchObject({status:502,code:'PASSWORD_RECOVERY_CONFIRMATION_FAILED'});
  });
  it('sanitizes invalid-token and server errors without parsing echoed secrets or retrying',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({type:'fixture-reset-token',password:'new-fixture-password'}),{status:401})).mockResolvedValueOnce(new Response('private diagnostic',{status:500}));vi.stubGlobal('fetch',fetch);
    await expect(client().confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password'})).rejects.toMatchObject({status:401,code:'PASSWORD_RECOVERY_INVALID_TOKEN'});
    await expect(client().confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password'})).rejects.toMatchObject({status:500,code:'PASSWORD_RECOVERY_CONFIRMATION_FAILED'});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uses a bounded timeout and sanitizes abort/transport exceptions',async()=>{
    const timeout=vi.spyOn(AbortSignal,'timeout');const fetch=vi.fn().mockRejectedValue(new Error('fixture-reset-token new-fixture-password'));vi.stubGlobal('fetch',fetch);
    try { await client().confirmPasswordRecovery({token:'fixture-reset-token',password:'new-fixture-password'});throw new Error('expected failure'); }
    catch(error){expect(error).toMatchObject({status:503,code:'PASSWORD_RECOVERY_NETWORK_UNAVAILABLE'});expect(String(error)).not.toContain('fixture-reset-token');expect(String(error)).not.toContain('new-fixture-password');}
    expect(timeout).toHaveBeenCalledWith(15000);expect(fetch).toHaveBeenCalledTimes(1);timeout.mockRestore();
  });
});
