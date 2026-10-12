// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionPane } from '../apps/desktop/src/ConnectionPane';
import { useCommunity } from '../apps/desktop/src/community';
afterEach(()=>cleanup());
it('lets the friend choose their own credentials with one signup ticket, without a separate account code',async()=>{
 const done=vi.fn();const register=vi.fn(async()=>{useCommunity.setState({user:{id:'friend',username:'Friend',displayName:'Friend',avatar:null},busy:false});});
 useCommunity.setState({user:null,busy:false,error:null,register});
 render(<MemoryRouter><ConnectionPane referenceMode="register" onAuthenticated={done}/></MemoryRouter>);
 expect(screen.queryByText(/Kayıt davet kodu \(sunucu istiyorsa\)/)).toBeNull();
 fireEvent.change(screen.getByLabelText('Topluluk davet kodu'),{target:{value:'single-invite'}});
 fireEvent.change(screen.getByLabelText('Kullanıcı adı'),{target:{value:'Friend'}});
 fireEvent.change(screen.getByLabelText('E-posta adresi'),{target:{value:'friend@example.test'}});
 fireEvent.change(screen.getByLabelText('Şifre'),{target:{value:'unique-test-password'}});
 fireEvent.click(screen.getByRole('button',{name:/Hesap oluştur ve katıl/}));
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
 expect(register).toHaveBeenCalledWith({serverUrl:'https://62.238.119.134',email:'friend@example.test',password:'unique-test-password',username:'Friend',inviteCode:'single-invite'});
});
