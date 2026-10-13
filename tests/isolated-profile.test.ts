import {describe,it,expect} from 'vitest';
import {join} from 'node:path';
import {isolatedProfilePath} from '../apps/desktop/electron/profile';
describe('native QA profile isolation',()=>{
 it('uses the ordinary profile only when no override was supplied',()=>expect(isolatedProfilePath('/DEMO/app-data',undefined)).toBeNull());
 it('resolves only a bounded child profile',()=>expect(isolatedProfilePath('/DEMO/app-data','qa-123')).toBe(join('/DEMO/app-data','ROOMS','qa-123')));
 it.each(['','qa-rc7-12345678-1234-1234-1234-123456789012','../rooms','/tmp/profile','qa/name','qa\\name','qa\0name','qa name'])('rejects malformed profile %j instead of using the default',value=>expect(()=>isolatedProfilePath('/DEMO/app-data',value)).toThrow('refusing'));
});
