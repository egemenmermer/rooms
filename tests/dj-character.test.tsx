// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DJCharacter} from '../apps/desktop/src/DJCharacter';
import * as branding from '../apps/desktop/src/community-branding';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('ships a visible static default without an animation or private-community asset',()=>{
 const view=render(<DJCharacter/>);
 expect(screen.getByRole('img',{name:'DJ'}).getAttribute('src')).toBe('./dj/default-dj.png');
 expect(view.container.querySelector('video')).toBeNull();
});
it('falls back to a still poster when a custom animation fails and revokes asset URLs on unmount',async()=>{
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:custom');
 const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.spyOn(branding,'fetchBrandingAsset').mockResolvedValue(new Blob(['fixture'],{type:'video/webm'}));
 const view=render(<DJCharacter branding={{name:'Our DJ',animation:'https://community.example.org/rooms-branding/loop.webm'}}/>);
 fireEvent.error(await screen.findByLabelText('Our DJ animasyonu'));
 expect(screen.getByRole('img',{name:'Our DJ'}).getAttribute('src')).toBe('./dj/default-dj.png');
 expect(create).toHaveBeenCalledTimes(1);view.unmount();expect(revoke).toHaveBeenCalledWith('blob:custom');
});
