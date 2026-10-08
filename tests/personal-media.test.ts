import {describe,it,expect} from 'vitest';
import {isPublicAddress,personalURL,redirectRequest} from '../packages/personal-media/src/network';
import {parsePlaylist,rewriteHLS,safeMediaLabel} from '../packages/personal-media/src/playlist';
describe('private personal media boundary',()=>{
 it('rejects reserved addresses including mapped IPv6 and credential userinfo',()=>{for(const ip of ['127.0.0.1','10.0.0.2','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','64:ff9b::7f00:1','2002:7f00:1::','3fff::1'])expect(isPublicAddress(ip)).toBe(false);expect(isPublicAddress('8.8.8.8')).toBe(true);expect(()=>personalURL('https://secret:token@example.com/')).toThrow();});
 it('normalizes channels while preserving secrets only in internal URLs',()=>{const list=parsePlaylist('#EXTM3U\n#EXTINF:-1 tvg-id="one" group-title="Films",My film\nhttps://example.com/live?token=secret','https://example.com/list');expect(list[0].name).toBe('My film');expect(list[0].id).not.toContain('secret');expect(list[0].group).toBe('Films');expect(()=>parsePlaylist('oops','https://example.com')).toThrow();});
 it('rewrites segments, variant playlists and key URIs to opaque handles',()=>{const urls:string[]=[];const out=rewriteHLS('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key?token=s"\nseg.ts?token=s','https://example.com/private/master.m3u8',u=>{urls.push(u);return `rooms-provider://handle-${urls.length}/stream`;});expect(out).not.toContain('token=');expect(urls).toHaveLength(2);expect(safeMediaLabel('https://example.com/secret')).toBe('Personal media');});
});

it('never forwards credentials in redirect POST bodies or cross-origin headers',()=>{expect(()=>redirectRequest(new URL('https://api.real-debrid.com/token'),new URL('https://other.example/token'),{method:'POST',body:'client_secret=secret'})).toThrow();expect(redirectRequest(new URL('https://one.example'),new URL('https://two.example'),{headers:{Authorization:'Bearer secret',Cookie:'secret',Range:'bytes=0-100'}}).headers).toEqual({Range:'bytes=0-100'});});

it('treats a direct HLS media manifest as one personal source instead of hundreds of segment channels',()=>{const items=parsePlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\n#EXTINF:6,\nseg2.ts','https://example.com/live/master.m3u8');expect(items).toHaveLength(1);expect(items[0].url).toBe('https://example.com/live/master.m3u8');});
