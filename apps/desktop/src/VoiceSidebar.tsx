import { ChannelTools } from './ChannelTools';
import { useNavigate } from 'react-router-dom';
import { AudioLines, Hash, Headphones, Mic, MicOff, PhoneOff, Settings, Plus } from 'lucide-react';
import { IconButton } from '@rooms/design';
import { useCommunity } from './community';
import { useRealtime, joinVoice, leaveVoice, toggleMic, toggleDeafen } from './realtime';
import { VoiceAvatar } from './VoiceAvatar';
import { uiError } from './i18n';
export function VoiceSidebar({ notify, invite }: {notify(message:string):void;invite():void}) {
  const c=useCommunity(),r=useRealtime(),navigate=useNavigate();
  const run=(task:Promise<unknown>)=>void task.catch(e=>notify(uiError(e)));
  const text=c.channels.filter(ch=>ch.type===0),voice=c.channels.filter(ch=>ch.type===2);
  return <ChannelTools><aside className="voice-channel-sidebar"><header><select aria-label="Topluluk seç" value={c.activeSpaceId??''} onChange={e=>run(c.openSpace(e.target.value))}>{c.spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><IconButton label="Davet oluştur" onClick={invite}><Plus size={18}/></IconButton></header>
    <div className="voice-channel-scroll"><div className="section-label" data-channel-type="text" tabIndex={0}>METİN KANALLARI<button data-create-type="text" aria-label="Metin kanalı oluştur"><Plus size={14}/></button></div>{text.map(ch=><button data-channel-id={ch.id} className={`room-channel ${c.activeChannelId===ch.id?'selected':''}`} key={ch.id} onClick={()=>{run(c.openChannel(ch.id));navigate('/chat');}}><Hash size={19}/><span>{ch.name}</span>{!!c.unread[ch.id]&&<i className="nav-dot"/>}</button>)}
    <div className="section-label" data-channel-type="voice" tabIndex={0}>SES KANALLARI<button data-create-type="voice" aria-label="Ses odası oluştur"><Plus size={14}/></button></div>{voice.map(ch=><div key={ch.id}><button data-channel-id={ch.id} className={`room-channel ${r.channelId===ch.id?'selected joined':''}`} disabled={r.busy} onClick={()=>{navigate('/voice');if(r.channelId!==ch.id||r.status!=='connected')run(joinVoice(ch.id,ch.name));}}><AudioLines size={19}/><span>{ch.name}</span></button>{r.channelId===ch.id&&r.participants.map(p=><button className={`channel-participant ${p.speaking&&!p.muted?'speaking':''}`} key={p.id} onClick={()=>navigate('/voice')}><VoiceAvatar id={p.id} name={p.name}/><span>{p.name}</span>{p.muted&&<MicOff size={13}/>}</button>)}</div>)}{!voice.length&&<p className="muted">Ses odası yok.</p>}</div>
    {r.channelId&&<div className="sidebar-call"><div><AudioLines size={18}/><span><strong>{r.status==='connected'?'Ses bağlandı':r.status==='reconnecting'?'Yeniden bağlanıyor':r.busy?'Bağlanıyor':'Bağlantı kesildi'}</strong><small>{r.roomName}</small></span><IconButton label="Sesten ayrıl" onClick={()=>run(leaveVoice())}><PhoneOff size={17}/></IconButton></div></div>}
    <footer><button className="sidebar-self" onClick={()=>navigate('/settings?tab=profile')}>{c.user&&<VoiceAvatar id={c.user.id} name={c.user.displayName}/>}<strong>{c.user?.displayName||c.user?.username}</strong></button><IconButton label={r.muted?'Mikrofonu aç':'Mikrofonu kapat'} disabled={r.status!=='connected'} onClick={()=>run(toggleMic())}>{r.muted?<MicOff size={17}/>:<Mic size={17}/>}</IconButton><IconButton label={r.deafened?'Sesi aç':'Sağırlaştır'} className={r.deafened?'muted-control':''} disabled={r.status!=='connected'} onClick={()=>run(toggleDeafen())}><Headphones size={17}/></IconButton><IconButton label="Ayarlar" onClick={()=>navigate('/settings')}><Settings size={17}/></IconButton></footer>
  </aside></ChannelTools>;
}
