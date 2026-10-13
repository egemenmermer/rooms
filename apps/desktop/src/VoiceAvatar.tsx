import { useEffect, useState } from 'react';
import { Avatar } from '@rooms/design';
import { useCommunity } from './community';
export function VoiceAvatar({ id, name, large=false }: { id:string;name:string;large?:boolean }) {
  const user=useCommunity(s=>s.user),server=useCommunity(s=>s.serverUrl);
  const [photo,setPhoto]=useState<string|null>(null);
  useEffect(()=>{let active=true;setPhoto(null);if(import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture')){void import('./dev/reference-fixtures').then(f=>{if(active)setPhoto(f.getReferenceAvatar(id));});return()=>{active=false;};}if(user&&!id.startsWith('rooms-music-'))void window.rooms?.social.avatar(id).then(value=>{if(active)setPhoto(value);}).catch(()=>{});return()=>{active=false;};},[id,user?.id,user?.avatar,server]);
  return photo?<img className={`voice-photo ${large?'large':''}`} src={photo} alt={name} onError={()=>setPhoto(null)}/>:<Avatar name={name} size={large?'large':'normal'}/>;
}
