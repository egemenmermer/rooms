import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Overlay } from './App';
import { useCommunity } from './community';
import { useRealtime, joinVoice } from './realtime';
import { useActivityRoom } from './activity';
import { ConnectionPane } from './ConnectionPane';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { uiError } from './i18n';
import './reference-home.css';

export function Home({open,notify}:{open(value:Overlay):void;notify(message:string):void}) {
  const c=useCommunity(),r=useRealtime(),navigate=useNavigate();
  const activity=useActivityRoom(c.user?r.channelId:null);
  const primary=activity.status==='connected'?activity.room?.primary:null;
  const [art,setArt]=useState<string|null>(null);
  useEffect(()=>{let alive=true;if(import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture'))void import('./dev/reference-fixtures').then(()=>{if(alive)setArt('/__reference/01_brand/cinema-still.svg');});return()=>{alive=false;};},[]);
  if(!c.user)return <div className="home-page"><ConnectionPane/></div>;
  const voices=c.channels.filter(channel=>channel.type===2),space=c.spaces.find(s=>s.id===c.activeSpaceId);
  const activityPath=primary?.activity==='cinema'?'/cinema':primary?.activity==='youtube'?'/youtube':primary?.activity==='screen'?'/voice?view=share':'/games';
  const currentDate=import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture')?new Date('2026-10-10T18:00:00Z'):new Date();
  const date=currentDate.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'});
  if(c.busy||c.loadingMessages)return <div className="reference-home" aria-busy="true"><div className="reference-home-skeleton"><i/><i/></div><div className="reference-room-grid">{[1,2,3].map(id=><div key={id} className="reference-room-skeleton"/>)}</div><p role="status">Aktif odalar yükleniyor…</p></div>;
  if(!c.spaces.length)return <div className="reference-home"><div className="reference-social-empty"><span><ReferenceIcon name="home" size={38}/></span><h2>Odanı bul, yerini al.</h2><p>Bir topluluğa katılınca aktif odaların ve arkadaşların burada görünür.</p><button className="button primary" onClick={()=>navigate('/setup/invite')}>Davet aç</button></div></div>;
  return <div className="reference-home"><div className="reference-home-greeting"><span>{date}</span><h1>Ana sayfa</h1></div>
    {primary&&<section className="reference-home-feature"><div><span className="reference-live-label">ŞİMDİ {r.roomName?.toLocaleUpperCase('tr')}’DA</span><h2>{primary.title}</h2><p>{activity.room?.participants.map(person=>person.displayName).join(', ')}</p><button className="button primary" onClick={()=>navigate(activityPath)}><ReferenceIcon name="play" size={18}/>Etkinliğe dön</button></div><div className="reference-home-art" style={art?{backgroundImage:`url('${art}')`}:undefined}><div className="reference-home-people">{activity.room?.participants.slice(0,3).map(person=><VoiceAvatar key={person.userId} id={person.userId} name={person.displayName}/>)}<span>{activity.room?.participants.length} kişi odada</span></div></div></section>}
    <div className="reference-home-section"><h3>Aktif odalar</h3><span>{space?.name}</span></div><div className="reference-room-grid">{voices.map(channel=><article className="reference-room-card" key={channel.id}><div className="reference-room-heading"><span><ReferenceIcon name={r.channelId===channel.id&&primary?'film':'volume'} size={24}/></span><div><h4>{channel.name}</h4><p>{r.channelId===channel.id?primary?`${primary.activity==='cinema'?'Cinema':primary.activity} · ${primary.title}`:`${r.participants.length} kişi odada`:'Ses odası'}</p></div></div><footer><span className="reference-room-people">{r.channelId===channel.id&&r.participants.slice(0,3).map(person=><VoiceAvatar key={person.id} id={person.id} name={person.name}/>)}</span><button className="button secondary small" disabled={r.busy} onClick={()=>{navigate('/voice');if(r.channelId!==channel.id||r.status!=='connected')void joinVoice(channel.id,channel.name).catch(error=>notify(uiError(error)));}}>{r.channelId===channel.id?'Odaya dön':'Katıl'}</button></footer></article>)}<article className="reference-room-card"><div className="reference-room-heading"><span className="green"><ReferenceIcon name="gamepad" size={24}/></span><div><h4>Oyun masası</h4><p>Bir masa aç, arkadaşlarını çağır.</p></div></div><button className="button ghost" onClick={()=>navigate('/games')}><ReferenceIcon name="plus" size={17}/>Masa oluştur</button></article><article className="reference-room-card"><div className="reference-room-heading"><span className="gold"><ReferenceIcon name="whiteboard" size={24}/></span><div><h4>Whiteboard</h4><p>Ortak whiteboard</p></div></div><button className="button ghost" onClick={()=>navigate('/together?tab=board')}><ReferenceIcon name="arrow-right" size={17}/>Tahtayı aç</button></article></div>
    <div className="reference-home-section"><h3>Son konuşmalar</h3><button onClick={()=>navigate('/friends')}><ReferenceIcon name="users" size={18}/>Arkadaşlar</button></div><div className="reference-recent">{c.dms.map(dm=>{const person=dm.recipients?.find(user=>user.id!==c.user?.id);return <button key={dm.id} onClick={()=>{void c.openChannel(dm.id).then(()=>navigate('/chat')).catch(error=>notify(uiError(error)));}}>{person&&<VoiceAvatar id={person.id} name={person.displayName}/>}<span><strong>{person?.displayName||dm.name}</strong><small>{c.unread[dm.id]?'Okunmamış mesaj':'Sohbeti aç'}</small></span><ReferenceIcon name="message" size={20}/></button>;})}{!c.dms.length&&<p>Sohbet yok.</p>}</div>
  </div>;
}
