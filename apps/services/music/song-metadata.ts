import {privateFetch,limitedText} from '../../../packages/personal-media/src/network';
import {parseSongLink} from '../../../packages/shared-contracts/src/song-links';
export interface SongMetadata {provider:'spotify'|'soundcloud';title:string;artists:string[];durationSec?:number}
const text=(value:unknown)=>typeof value==='string'?value.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,160):'';
/** Reads only public display metadata. Never reads provider audio, previews or account state. */
export async function songMetadata(raw:string,request:typeof privateFetch=privateFetch):Promise<SongMetadata>{
 let link=parseSongLink(raw);if(!link)throw new Error('MUSIC_SOURCE_FAILED');
 if(link.kind==='unsupported')throw new Error('MUSIC_MIRROR_SINGLE_TRACK_ONLY');
 const hosts=link.provider==='spotify'?['open.spotify.com','spotify.link']:['soundcloud.com','www.soundcloud.com','on.soundcloud.com'];
 const options={allowedHosts:hosts,allowedProtocols:['https:'],signal:AbortSignal.timeout(12000),headers:{'User-Agent':'ROOMS/1.0 Public song metadata'}};
 try{
 if(link.kind==='short'){const response=await request(link.url,options);await response.body?.cancel();const next=parseSongLink(response.url);if(!response.ok||next?.kind!=='track'||next.provider!==link.provider)throw new Error('MUSIC_MIRROR_SINGLE_TRACK_ONLY');link=next;}
 if(link.provider==='spotify'){
 const html=await limitedText(await request(`https://open.spotify.com/embed/track/${link.id}`,options),2*1024*1024);
 const match=html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);if(!match)throw new Error('Metadata unavailable');
 const entity=JSON.parse(match[1]!).props?.pageProps?.state?.data?.entity;
 if(entity?.id!==link.id||entity?.type!=='track')throw new Error('Metadata mismatch');
 const title=text(entity.name),artists=Array.isArray(entity.artists)?entity.artists.slice(0,8).map((a:{name?:unknown})=>text(a?.name)).filter(Boolean):[];
 const durationSec=Number(entity.duration)/1000;if(!title||!artists.length||!Number.isFinite(durationSec)||durationSec<=0||durationSec>7200)throw new Error('Metadata incomplete');
 return{provider:'spotify',title,artists,durationSec};
 }
 const endpoint=new URL('https://soundcloud.com/oembed');endpoint.searchParams.set('format','json');endpoint.searchParams.set('url',link.url);
 const value=JSON.parse(await limitedText(await request(endpoint.href,options),64*1024));const artist=text(value.author_name),name=text(value.title);
 const author=new URL(value.author_url);if(author.hostname!=='soundcloud.com'||author.pathname.split('/')[1]!==new URL(link.url).pathname.split('/')[1])throw new Error('Metadata mismatch');
 const title=name.endsWith(` by ${artist}`)?name.slice(0,-artist.length-4).trim():name;
 if(value.provider_name!=='SoundCloud'||!title||!artist)throw new Error('Metadata incomplete');
 let durationSec:number|undefined;
 // Some public track pages include duration. Absence never triggers private API access.
 try{const html=await limitedText(await request(link.url,options),2*1024*1024);const hydration=html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/);if(hydration){const records=JSON.parse(hydration[1]!);const track=Array.isArray(records)?records.find(v=>v?.hydratable==='sound')?.data:null;const duration=Number(track?.duration)/1000;if(text(track?.title)===title&&Number.isFinite(duration)&&duration>0&&duration<=7200)durationSec=duration;}}catch{/* Public oEmbed metadata remains available without a duration. */}
 return{provider:'soundcloud',title,artists:[artist],...(durationSec?{durationSec}:{})};
 }catch(error){if(error instanceof Error&&error.message==='MUSIC_MIRROR_SINGLE_TRACK_ONLY')throw error;throw new Error('MUSIC_MIRROR_METADATA_UNAVAILABLE');}
}
