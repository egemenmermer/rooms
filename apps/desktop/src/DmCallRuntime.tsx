import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Headphones, MessageSquare, Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X } from 'lucide-react';
import { useCommunity } from './community';
import { useRealtime, useVoiceContext, toggleMic, toggleCamera, toggleDeafen, startRoomAudio, attachMediaTrack } from './realtime';
import { acceptDmCall, joinAcceptedDmCall, dismissDmCallError, endDmCall, refreshDmCall, resetDmCalls, useDmCall } from './dm-call';
import { VoiceAvatar } from './VoiceAvatar';
import './reference-dm-call.css';
function CallVideo({trackId}:{trackId:string}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{if(!ref.current)return;try{return attachMediaTrack(trackId,ref.current);}catch{/* Track removal is reflected by the next provider state. */}},[trackId]);return <video ref={ref} autoPlay playsInline muted/>;}
/** Mount once outside Routes. Invitations never join media or open a device without local consent. */
export default function DmCallRuntime(){
  const {call,busy,error,connected}=useDmCall(),community=useCommunity(),media=useRealtime(),voice=useVoiceContext();
  const navigate=useNavigate(),location=useLocation(),[now,setNow]=useState(Date.now());
  const polling=useRef(false),knownDms=useRef(new Set<string>());
  const account=community.user?`${community.serverUrl}:${community.user.id}`:'';
  const previousAccount=useRef(account);
  useLayoutEffect(()=>{if(previousAccount.current!==account){previousAccount.current=account;void resetDmCalls();}},[account]);
  useEffect(()=>{
    if(import.meta.env.DEV&&new URLSearchParams(window.location.search).has('fixture'))return;
    let cancelled=false;
    const poll=async()=>{if(cancelled||polling.current)return;polling.current=true;try{await refreshDmCall();}finally{polling.current=false;}};
    void poll();const timer=setInterval(()=>{setNow(Date.now());void poll();},3000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[account]);
  useEffect(()=>{if(!account)void resetDmCalls();},[account]);
  useEffect(()=>{const next=new Set(community.dms.map(dm=>dm.id));if(call&&knownDms.current.has(call.dmId)&&!next.has(call.dmId))void endDmCall();knownDms.current=next;},[community.dms,call?.id]);
  useEffect(()=>{if(connected&&media.status==='error')void endDmCall().then(()=>useDmCall.setState({error:'Medya bağlantısı kesildi. Yeni bir arama başlatabilirsin.'}));},[connected,media.status]);
  if(!community.user)return null;
  if(!call){return error?<aside className="dm-call-notice" role="status"><span>{error}</span><button aria-label="Bildirimi kapat" onClick={dismissDmCallError}><X size={18}/></button></aside>:location.pathname==='/dm-call'?<section className="dm-call-empty"><Phone size={38}/><h2>Etkin özel görüşme yok.</h2><button className="button secondary" onClick={()=>navigate('/chat')}>Mesajlara dön</button></section>:null;}
  const incoming=call.calleeId===community.user?.id,peerId=incoming?call.callerId:call.calleeId,peerName=incoming?call.callerName:call.calleeName;
  const full=location.pathname==='/dm-call',ringing=call.state==='ringing';
  const status=ringing?(incoming?'Gelen özel arama':'Yanıt bekleniyor…'):media.status==='reconnecting'?'Yeniden bağlanıyor…':connected&&media.status==='connected'?'Bağlı':'Bağlanıyor…';
  const run=(operation:()=>Promise<unknown>)=>{void operation().catch(error=>useDmCall.setState({error:error instanceof Error?error.message:'İşlem tamamlanamadı.'}));};
  const messages=async()=>{await community.openChannel(call.dmId);navigate('/chat');};
  const finish=async(action:'end'|'reject'='end')=>{const dmId=call.dmId;await endDmCall(action);if(full){if(useCommunity.getState().dms.some(dm=>dm.id===dmId))await useCommunity.getState().openChannel(dmId);navigate('/chat');}};
  const accept=async(camera=false)=>{await acceptDmCall(camera);navigate('/dm-call');};
  const occupied=!!voice.channelId;
  const controls=<>{!ringing&&!connected&&!busy&&<button className="button primary" disabled={occupied} onClick={()=>run(()=>joinAcceptedDmCall(false))}>Görüşmeye katıl</button>}{ringing&&incoming?<><button className="button primary" disabled={busy||occupied} title={occupied?'Önce bağlı olduğun ses odasından ayrıl.':undefined} onClick={()=>run(()=>accept(false))}><Phone size={18}/>Sesli kabul et</button>{call.mode==='video'&&<button className="button secondary" disabled={busy||occupied} title={occupied?'Önce bağlı olduğun ses odasından ayrıl.':undefined} onClick={()=>run(()=>accept(true))}><Video size={18}/>Kamerayla kabul et</button>}<button className="button danger" disabled={busy} onClick={()=>run(()=>finish('reject'))}>Reddet</button></>:<><button aria-label={media.muted?'Mikrofonu aç':'Mikrofonu kapat'} disabled={!connected||busy} onClick={()=>run(toggleMic)}>{media.muted?<MicOff/>:<Mic/>}</button><button aria-label={media.deafened?'Sesi aç':'Sesi kapat'} disabled={!connected||busy} aria-pressed={media.deafened} onClick={()=>run(toggleDeafen)}><Headphones/></button><button aria-label={media.camera?'Kamerayı kapat':'Kamerayı aç'} disabled={!connected||busy} onClick={()=>run(toggleCamera)}>{media.camera?<Video/>:<VideoOff/>}</button><button className="button danger" disabled={busy&&!connected&&!ringing} onClick={()=>run(()=>finish())}><PhoneOff size={18}/>{ringing?'Aramayı iptal et':'Görüşmeyi bitir'}</button></>}</>;
  if(!full)return <aside className="dm-call-compact" aria-label="Özel görüşme"><VoiceAvatar id={peerId} name={peerName}/><div><strong>{peerName}</strong><small>{status}</small></div><button onClick={()=>navigate('/dm-call')}>{ringing?'Aramayı aç':'Görüşmeye dön'}</button>{ringing&&incoming?<>{controls}</>:<button aria-label="Görüşmeyi bitir" onClick={()=>run(()=>finish())}><PhoneOff size={19}/></button>}{occupied&&ringing&&incoming&&<small>Önce bağlı olduğun ses odasından ayrıl.</small>}{error&&<small role="alert">{error}</small>}</aside>;
  const peer=media.participants.find(person=>person.id===peerId),local=media.participants.find(person=>person.local);
  const peerTrack=media.tracks.find(track=>track.participantId===peerId&&track.source==='camera'&&!track.muted),localTrack=media.tracks.find(track=>track.local&&track.source==='camera'&&!track.muted);
  const video=!!peerTrack||!!localTrack;
  const elapsed=call.acceptedAt?Math.max(0,Math.floor((now-call.acceptedAt)/1000)):0;
  return <section className="dm-call-stage"><header><Phone size={22}/><strong>{peerName}</strong><span>Özel {video?'görüntülü':'sesli'} görüşme</span></header><div className="dm-call-body"><div className="dm-call-heading"><div><h6>ÖZEL GÖRÜŞME</h6><h1>{peerName} ile görüşme</h1></div><button className="button secondary" onClick={()=>run(messages)}><MessageSquare size={18}/>Mesajlara dön</button></div><div className="dm-call-status"><span className={connected?'connected':''}>{status}</span>{connected&&<time>{String(Math.floor(elapsed/60)).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')}</time>}<small>Yalnızca sen ve {peerName}</small></div><div className={`dm-call-people ${video?'video':''}`}><article className={peer?.speaking?'speaking':''}>{peerTrack?<CallVideo trackId={peerTrack.id}/>:<div className="dm-call-person"><VoiceAvatar id={peerId} name={peerName} large/><h2>{peerName}</h2><p>{ringing?status:peer?peer.speaking?'Konuşuyor':peer.muted?'Mikrofon kapalı':'Mikrofon açık':'Bağlanması bekleniyor…'}</p></div>}{peerTrack&&<strong className="dm-call-name">{peerName}</strong>}</article><article className={`dm-call-self ${local?.speaking?'speaking':''}`}>{localTrack?<CallVideo trackId={localTrack.id}/>:<div className="dm-call-person"><VoiceAvatar id={community.user!.id} name={community.user!.displayName}/><span>{community.user!.displayName} (sen)</span><small>{media.muted?'Mikrofon kapalı':'Mikrofon açık'}</small></div>}{localTrack&&<strong className="dm-call-name">{community.user!.displayName} (sen)</strong>}</article></div>{occupied&&ringing&&incoming&&<p className="dm-call-error">Kabul etmeden önce bağlı olduğun ses odasından ayrıl.</p>}{error&&<p className="dm-call-error" role="alert">{error}</p>}{media.audioBlocked&&connected&&<button className="button secondary" onClick={()=>run(startRoomAudio)}>Görüşme sesini aç</button>}<footer>{controls}</footer></div></section>;
}
