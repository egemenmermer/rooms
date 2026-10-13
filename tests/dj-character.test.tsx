// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DJCharacter} from '../apps/desktop/src/DJCharacter';
afterEach(cleanup);
it('keeps the local poster visible after decode failure and retries only on user action',()=>{
 render(<DJCharacter/>);const first=screen.getByLabelText('Recep DJ animasyonu');
 fireEvent.error(first);expect(screen.getByRole('img',{name:'Recep DJ'}).getAttribute('src')).toBe('./dj/recep-dj.png');expect(screen.getByRole('status').textContent).toContain('Animasyon oynatılamadı.');
 expect(screen.queryByLabelText('Recep DJ animasyonu')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Yeniden dene'}));expect(screen.getByLabelText('Recep DJ animasyonu')).not.toBe(first);expect(screen.queryByRole('status')).toBeNull();
});
