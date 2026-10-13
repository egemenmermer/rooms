import {useLocation,useNavigate} from 'react-router-dom';
import {CommunityChat,CommunityVoice} from './RealSocial';
import {useCommunity} from './community';
import {useRealtime} from './realtime';
import {useChannelAccess} from './channel-access';
import {ChannelAccessState} from './CommunitySettings';
/** Room conversation is the room's actual upstream channel, never another room's log. */
export function RoomConversation({notify,openLauncher,toggleMembers,membersVisible,search}:{notify(message:string):void;openLauncher():void;toggleMembers():void;membersVisible:boolean;search():void}) {
 const c=useCommunity(),r=useRealtime(),navigate=useNavigate(),location=useLocation();
 const access=useChannelAccess(s=>c.activeChannelId?s.checks[c.activeChannelId]:undefined);
 const selected=c.channels.find(ch=>ch.id===c.activeChannelId);
 const view=new URLSearchParams(location.search).get('view');
 if(access){if(access==='denied')return <ChannelAccessState kind="denied" voiceConnected={r.status==='connected'} voiceRoomName={r.roomName??undefined} onReturn={()=>navigate('/home')}/>;return <div className="quiet-inline-state" role="status">{access==='checking'?'Erişim kontrol ediliyor…':'Sohbet alınamadı.'}<button onClick={()=>{if(c.activeChannelId)void c.openChannel(c.activeChannelId);}}>Yeniden dene</button></div>;}
 if(location.pathname==='/voice'&&view!=='chat')return <CommunityVoice openLauncher={openLauncher} notify={notify}/>;
 const inRoom=!r.busy&&r.status==='connected'&&selected?.type===2&&selected.id===r.channelId;
 const screens=inRoom&&r.tracks.some(t=>t.source==='screen_share'&&!t.muted);
 const cameras=inRoom&&r.tracks.some(t=>t.source==='camera'&&!t.muted);
 return <div className="room-conversation">{(screens||cameras)&&<div className="minimal-live-content">{screens&&<button onClick={()=>navigate('/voice?view=share')}>Ekran paylaşımını izle</button>}{cameras&&<button onClick={()=>navigate('/voice?view=video')}>Kameraları göster</button>}</div>}<CommunityChat notify={notify} membersVisible={membersVisible} onToggleMembers={toggleMembers} onSearch={search}/></div>;
}
