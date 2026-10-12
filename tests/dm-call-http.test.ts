import { afterEach,describe,it,expect,vi } from 'vitest';
import { requestDmCall } from '../apps/desktop/electron/dm-call-http';
import type { StoatClient } from '@rooms/stoat';
const client={instanceUrl:'https://local.example/api',getToken:()=> 'local-test-token'} as StoatClient;
afterEach(()=>vi.restoreAllMocks());
describe('native private-call signaling availability',()=>{
 it.each([404,501])('reports a missing endpoint precisely for status %s',async status=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>Not found</html>',{status}));
  await expect(requestDmCall(client,'poll',{})).rejects.toThrow('Bu sunucuda özel arama servisi etkin değil.');
 });
 it('still validates available polling responses',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({call:null}),{status:200}));
  expect(await requestDmCall(client,'poll',{})).toEqual({call:null});
 });
});
