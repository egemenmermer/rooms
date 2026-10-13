export type SongLink={provider:'spotify'|'soundcloud';kind:'track'|'short'|'unsupported';url:string;id?:string};
/** Public share links only; no credentials, provider cookies or arbitrary extractor targets. */
export function parseSongLink(raw:string):SongLink|null {
 try{const u=new URL(raw.trim());if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const provider=['open.spotify.com','spotify.link'].includes(u.hostname)?'spotify':['soundcloud.com','www.soundcloud.com','on.soundcloud.com'].includes(u.hostname)?'soundcloud':null;if(!provider)return null;
 const canonical=new URL(u.origin+u.pathname);let kind:SongLink['kind']='unsupported',id:string|undefined;
 if(u.hostname==='spotify.link'||u.hostname==='on.soundcloud.com'){if(/^\/[A-Za-z0-9_-]{1,128}\/?$/.test(u.pathname))kind='short';}
 else if(provider==='spotify'){const match=u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/);if(match){kind='track';id=match[1];canonical.href=`https://open.spotify.com/track/${id}`;}}
 else if(/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)&&!['sets','tracks','likes','albums','reposts','popular-tracks'].includes(u.pathname.split('/')[2]??'')&&!u.pathname.startsWith('/discover/')&&!u.searchParams.has('secret_token')){kind='track';canonical.hostname='soundcloud.com';}
 return{provider,kind,url:canonical.href,...(id?{id}:{})};
 }catch{return null;}
}
