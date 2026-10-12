import { useEffect, useRef, useState } from 'react';
import type { SocialUser } from '@rooms/social';
import { useCommunity } from './community';
import { useFriendList } from './FriendsPage';
import { uiError } from './i18n';
/** Public relationship action; a closed or changed account never receives a delayed result. */
export function FriendRequestButton({user}:{user:SocialUser}) {
  const c=useCommunity(),list=useFriendList();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(false),generation=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{generation.current++;setBusy(false);setError('');},[c.user?.id,c.serverUrl,user.id]);
  const fixture=import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture');
  const relation=list.friends.find(friend=>friend.user.id===user.id)?.relationship;
  const handle=`${user.username}${user.discriminator?'#'+user.discriminator:''}`;
  const label=relation==='friend'?'Arkadaşsınız':relation==='outgoing'?'İstek gönderildi':relation==='incoming'?'İsteği kabul et':relation==='blocked'?'Engeli kaldır':'Arkadaş ekle';
  const unavailable=fixture?'Yerel görsel örnek arkadaşlık isteği göndermez.':!window.rooms?.social?'Masaüstü uygulaması gerekli.':!user.discriminator&&relation!=='blocked'?'Kullanıcı etiketi alınamadı.':undefined;
  const send=async()=>{
    if(busy||unavailable||!window.rooms)return;
    const account=c.user?.id,server=c.serverUrl,epoch=generation.current;
    const current=()=>mounted.current&&generation.current===epoch&&useCommunity.getState().user?.id===account&&useCommunity.getState().serverUrl===server;
    setBusy(true);setError('');
    try{
      if(relation==='blocked')await window.rooms.social.unblockUser(user.id);
      else await window.rooms.social.addFriend(handle);
      if(current()){window.dispatchEvent(new Event('rooms:friends-changed'));await list.refresh();}
    }catch(failure){if(current())setError(uiError(failure));}
    finally{if(current())setBusy(false);}
  };
  if(user.id===c.user?.id||user.bot)return null;
  return <div className="friend-request-action"><button className="button secondary" disabled={!!unavailable||busy||list.loading||relation==='friend'||relation==='outgoing'} title={unavailable} onClick={()=>void send()}>{busy?'Gönderiliyor…':label}</button>{error&&<p role="alert">{error}</p>}</div>;
}
