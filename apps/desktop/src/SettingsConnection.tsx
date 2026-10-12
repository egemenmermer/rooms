import {useNavigate} from 'react-router-dom';
import {IconButton} from '@rooms/design';
import {useCommunity} from './community';
import {useRealtime,leaveVoice,toggleMic,toggleDeafen} from './realtime';
import {VoiceAvatar} from './VoiceAvatar';
import {ReferenceIcon} from './ReferenceIcon';
import {uiError} from './i18n';

export function SettingsConnection({notify}:{notify(message:string):void}){
 const c=useCommunity(),r=useRealtime(),navigate=useNavigate();
 const run=(work:Promise<void>)=>void work.catch(e=>notify(uiError(e)));
 return <div className="settings-nav-connection">{r.channelId&&<div className="settings-connected-room"><div><ReferenceIcon name="wifi" size={17}/><strong>{r.status==='connected'?'Ses bağlı':r.status==='reconnecting'?'Yeniden bağlanıyor':'Bağlantı kesildi'}</strong><IconButton label="Sesten ayrıl" onClick={()=>run(leaveVoice())}><ReferenceIcon name="logout" size={18}/></IconButton></div><small>{r.roomName} / {c.spaces.find(s=>s.id===c.activeSpaceId)?.name}</small><div className="settings-connected-actions"><button disabled={r.status!=='connected'} onClick={()=>navigate('/voice?view=video')}><ReferenceIcon name="video" size={14}/>Video</button><button disabled={r.status!=='connected'} onClick={()=>navigate('/voice?view=share&choose=1')}><ReferenceIcon name="monitor" size={14}/>Ekran</button></div></div>}
 {c.user&&<footer><VoiceAvatar id={c.user.id} name={c.user.displayName}/><div><strong>{c.user.displayName}</strong><small>{c.status==='connected'?'Çevrimiçi':'Bağlantı kesildi'}</small></div><IconButton label={r.muted?'Mikrofonu aç':'Mikrofonu kapat'} disabled={r.status!=='connected'} onClick={()=>run(toggleMic())}><ReferenceIcon name={r.muted?'mic-off':'mic'} size={17}/></IconButton><IconButton label={r.deafened?'Sesi aç':'Sağırlaştır'} disabled={r.status!=='connected'} onClick={()=>run(toggleDeafen())}><ReferenceIcon name="headphones" size={17}/></IconButton></footer>}
 </div>;
}
