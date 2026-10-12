import {useNavigate} from 'react-router-dom';
import {useCommunity} from './community';
import {VoiceAvatar} from './VoiceAvatar';
import {uiError} from './i18n';
export function Messages({notify}:{notify(message:string):void}) {
 const c=useCommunity(),navigate=useNavigate();
 return <div className="minimal-messages">{c.dms.map(dm=>{const p=dm.recipients?.find(u=>u.id!==c.user?.id);return <button key={dm.id} onClick={()=>{navigate('/chat');void c.openChannel(dm.id).catch(e=>notify(uiError(e)));}}>{p&&<VoiceAvatar id={p.id} name={p.displayName}/>}<span>{p?.displayName??dm.name}</span>{c.unread[dm.id]&&<i className="nav-dot"/>}</button>;})}{!c.dms.length&&<p>Henüz konuşma yok.</p>}<button className="text-button" onClick={()=>navigate('/friends')}>Arkadaşlar</button></div>;
}
