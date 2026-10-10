import { useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@rooms/design';
import { useCommunity } from './community';
import { leaveVoice, useVoiceContext } from './realtime';
import { uiError } from './i18n';
import type { SocialChannel } from '@rooms/social';

type Action={kind:'create'|'rename'|'delete';type:'text'|'voice';channel?:SocialChannel};
export function ChannelTools({children}:{children:ReactNode}) {
  const c=useCommunity();
  const [menu,setMenu]=useState<{x:number;y:number;channel?:SocialChannel;type:'text'|'voice'}|null>(null);
  const [action,setAction]=useState<Action|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null),origin=useRef<HTMLElement|null>(null);
  const dismiss=useCallback(()=>{setMenu(null);origin.current?.focus();},[]);
  const close=useCallback(()=>{if(!busy){setAction(null);origin.current?.focus();}},[busy]);
  useEffect(()=>{if(!menu)return;menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();const outside=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))dismiss();};const key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismiss();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menuRef.current!.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};window.addEventListener('pointerdown',outside);window.addEventListener('keydown',key);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',key);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);};},[menu,dismiss]);
  function show(event:MouseEvent|KeyboardEvent){if(!c.activeSpaceId)return;const target=(event.target as HTMLElement).closest<HTMLElement>('[data-channel-id],[data-channel-type]');if(!target)return;event.preventDefault();const channel=c.channels.find(ch=>ch.id===target.dataset.channelId),rect=target.getBoundingClientRect();origin.current=target;setMenu({channel,type:channel?.type===2||target.dataset.channelType==='voice'?'voice':'text',x:Math.max(8,Math.min('clientX' in event?event.clientX:rect.left,window.innerWidth-248)),y:Math.max(8,Math.min('clientY' in event?event.clientY:rect.bottom,window.innerHeight-180))});}
  function choose(kind:Action['kind'],type=menu!.type){setAction({kind,type,channel:menu?.channel});setName(kind==='rename'?menu?.channel?.name??'':'');setError('');setMenu(null);}
  async function save(){if(!action||!c.activeSpaceId||busy)return;const current=action,spaceId=c.activeSpaceId;setBusy(true);setError('');try{
    const social=window.rooms!.social;
    const channel=current.kind==='create'?await social.createChannel(spaceId,name.trim(),current.type):current.kind==='rename'?await social.renameChannel(current.channel!.id,name.trim()):null;
    if(current.kind==='delete'){await social.deleteChannel(current.channel!.id);if(useVoiceContext.getState().channelId===current.channel!.id)await leaveVoice();}
    if(current.kind==='rename'&&useVoiceContext.getState().channelId===channel?.id)useVoiceContext.setState({roomName:channel!.name});
    const channels=await social.channels(spaceId);
    if(useCommunity.getState().activeSpaceId===spaceId){useCommunity.setState({channels});const active=useCommunity.getState().activeChannelId;if(current.kind==='create'&&channel?.type===0)await useCommunity.getState().openChannel(channel.id);else if(active&&!channels.some(ch=>ch.id===active)){const next=channels.find(ch=>ch.type===0);if(next)await useCommunity.getState().openChannel(next.id);else useCommunity.setState({activeChannelId:null,messages:[]});}}
    setAction(null);origin.current?.focus();
  }catch(e){setError(uiError(e));}finally{setBusy(false);}}
  return <div className="channel-tools" onClick={e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('[data-create-type]');if(target&&c.activeSpaceId){origin.current=target;setName('');setError('');setAction({kind:'create',type:target.dataset.createType==='voice'?'voice':'text'});}}} onContextMenu={show} onKeyDown={e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)show(e);}}>{children}
  {menu&&createPortal(<div className="channel-context-menu" ref={menuRef} role="menu" aria-label="Kanal işlemleri" style={{left:menu.x,top:menu.y}}><button role="menuitem" onClick={()=>choose('create','text')}>Metin kanalı oluştur</button><button role="menuitem" onClick={()=>choose('create','voice')}>Ses odası oluştur</button>{menu.channel&&<><hr/><button role="menuitem" onClick={()=>choose('rename')}>Adını değiştir</button><button className="destructive" role="menuitem" onClick={()=>choose('delete')}>Kanalı sil</button></>}</div>,document.body)}
  {action&&<Modal title={action.kind==='delete'?'Kanalı sil':action.kind==='rename'?'Adını değiştir':action.type==='voice'?'Ses odası oluştur':'Metin kanalı oluştur'} onClose={close}><form onSubmit={e=>{e.preventDefault();void save();}}>{action.kind==='delete'?<p>“{action.channel?.name}” ve kanalın mesajları silinecek. Bu işlem geri alınamaz.</p>:<label className="field-label">KANAL ADI<input autoFocus required maxLength={32} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}<div className="button-row"><button type="button" className="button secondary" disabled={busy} onClick={close}>Vazgeç</button><button className={`button ${action.kind==='delete'?'danger':'primary'}`} disabled={busy||action.kind!=='delete'&&!name.trim()}>{busy?'Kaydediliyor…':action.kind==='delete'?'Sil':action.kind==='rename'?'Kaydet':'Oluştur'}</button></div>{error&&<div className="error-pane" role="alert">{error}</div>}</form></Modal>}</div>;
}
