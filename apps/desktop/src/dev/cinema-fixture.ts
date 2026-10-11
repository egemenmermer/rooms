import type { DesktopBridge } from '@rooms/contracts';
import type { ActivityResponse, RoomSnapshot } from '@rooms/activity-protocol';
import { installMediaFixture } from './media-fixture';
import { installDevelopmentRuntime, mediaBridge, mediaProvider } from '../runtime-sources';
import { useCinemaSession } from '../cinema-session';

const roomId = 'demo-channel-salon';
const sourceVersion = '00000000-0000-4000-8000-000000000025';
const sourceUrl = 'rooms-fixture://cinema-local-preview';
const people = ['Deniz', 'Ece', 'Can', 'Zeynep', 'Mert'];
const allowed: Record<string, readonly string[]> = {
  S24: ['default', 'empty'], S25: ['default', 'buffering', 'reconnect', 'source_missing', 'host_left'],
  S26: ['default', 'matching', 'late', 'mismatch', 'error'], S27: ['default', 'presenter', 'source_lost'],
  S28: ['default', 'empty', 'keyboard', 'shared'],
};

/** Exact named states only; responsive aliases resolve to the same default component. */
export function cinemaFixtureVariant(id: string, variant: string): string {
  const screen = id.toUpperCase();
  const name = /^\d+x\d+$/.test(variant) ? 'default' : variant.toLowerCase() || 'default';
  if (!allowed[screen]?.includes(name)) throw new Error(`Unsupported Cinema fixture ${id}/${variant}`);
  return name;
}

export function cinemaFixtureRoom(screen: string, variant: string): RoomSnapshot {
  const now = Date.now();
  const members = people.filter(name => !(screen === 'S25' && variant === 'host_left' && name === 'Mert')).map(name => ({ userId: `demo-${name.toLowerCase()}`, displayName: name, canControl: true, canCreate: true, joinedAt: 0, lastSeenAt: now }));
  const titles = ['Gecenin Kıyısında', 'Şehir Uyurken', 'Pazar Yolculuğu'];
  const queue = screen === 'S24' && variant === 'empty' || screen === 'S28' && variant === 'empty' ? [] : titles.map((title, index) => ({ id: `demo-cinema-${index + 1}`, addedBy: members[index]?.userId ?? 'demo-deniz', media: { kind: 'independent-source' as const, referenceId: `demo-film-${index + 1}`, title } }));
  const item = queue[0];
  return { roomId, revision: 1, participants: members,
    primary: screen === 'S24' && variant === 'empty' ? null : { activity: 'cinema', title: titles[0]!, hostUserId: screen === 'S25' && variant === 'host_left' ? 'demo-ece' : 'demo-mert', state: 'live', startedAt: 0 },
    timeline: { itemId: item?.id ?? null, epoch: 1, positionSec: screen === 'S26' && variant !== 'late' ? 0 : 2068, playing: false, rate: 1, effectiveServerTimeMs: now },
    queue, cinema: item ? { itemId: item.id, referenceId: item.media.referenceId, timelineEpoch: 1, durationSec: 6120, sources: members.filter(person => person.userId !== 'demo-deniz').map(person => ({ userId: person.userId, durationSec: 6120, ready: true, sourceVersion, updatedAt: now })) } : null,
    polls: [], whiteboard: [],
  };
}

/** Local-only Activity adapter for actual component controls, never native or remote accounts. */
export function createCinemaFixtureActivity(initial: RoomSnapshot): DesktopBridge['activity'] {
  let room = initial;
  const response = (): ActivityResponse => ({ protocolVersion: 1, serverTimeMs: Date.now(), room: structuredClone(room), events: [], replayRequired: false });
  return { snapshot: async () => response(), command: async (_id, envelope) => {
    if (envelope.expectedRevision !== room.revision) throw new Error('Demo fixture revision changed. Refresh the room.');
    const command = envelope.command;
    if (command.type === 'join') {
      if (!room.participants.some(person => person.userId === 'demo-deniz')) room.participants.push({ userId: 'demo-deniz', displayName: 'Deniz', joinedAt: 0, lastSeenAt: Date.now(), canControl: true });
    } else if (command.type === 'start') {
      if (room.primary) throw new Error('An Activity is already open in this demo fixture.');
      room.primary = { activity: command.activity, title: command.title, hostUserId: 'demo-deniz', startedAt: Date.now(), state: 'live' };
    } else if (command.type === 'queue.add') {
      room.queue.push({ id: command.itemId, media: command.media, addedBy: 'demo-deniz' });
    } else if (command.type === 'queue.select') {
      const item = room.queue.find(item => item.id === command.itemId);
      if (item?.media.kind !== 'independent-source') throw new Error('Select a listed Cinema title.');
      room.timeline = { ...room.timeline, itemId: item.id, epoch: room.timeline.epoch + 1, positionSec: 0, playing: false };
      room.cinema = { itemId: item.id, timelineEpoch: room.timeline.epoch, referenceId: item.media.referenceId, durationSec: null, sources: [] };
    } else if (command.type === 'queue.remove') {
      if (command.itemId === room.timeline.itemId) throw new Error('The current item cannot be removed.');
      room.queue = room.queue.filter(item => item.id !== command.itemId);
    } else if (command.type === 'queue.reorder') {
      if (new Set(command.itemIds).size !== room.queue.length || command.itemIds.length !== room.queue.length || command.itemIds.some(id => !room.queue.some(item => item.id === id)) || command.itemIds.indexOf(room.timeline.itemId ?? '') !== room.queue.findIndex(item => item.id === room.timeline.itemId)) throw new Error('Keep the current item fixed.');
      room.queue = command.itemIds.map(id => room.queue.find(item => item.id === id)!);
    } else if (command.type === 'cinema.source') {
      if (!room.cinema || room.cinema.itemId !== command.itemId || room.cinema.timelineEpoch !== command.timelineEpoch) throw new Error('The demo room item changed.');
      room.cinema.sources = [...room.cinema.sources.filter(source => source.userId !== 'demo-deniz'), { userId: 'demo-deniz', sourceVersion: command.sourceVersion, durationSec: command.durationSec, ready: false, updatedAt: Date.now() }];
      room.cinema.durationSec ??= command.durationSec;
    } else if (command.type === 'cinema.ready') {
      const source = room.cinema?.sources.find(source => source.userId === 'demo-deniz' && source.sourceVersion === command.sourceVersion);
      if (!source) throw new Error('Declare the local demo source first.');
      source.ready = command.ready; source.updatedAt = Date.now();
    } else if (command.type === 'cinema.release') {
      if (room.cinema) room.cinema.sources = room.cinema.sources.filter(source => source.userId !== 'demo-deniz' || source.sourceVersion !== command.sourceVersion);
    } else if (command.type === 'cinema.playback') {
      const source = room.cinema?.sources.find(source => source.userId === 'demo-deniz' && source.ready && source.sourceVersion === command.sourceVersion);
      if (!source) throw new Error('The demo source must be ready.');
      room.timeline = { ...room.timeline, playing: command.playing, positionSec: command.positionSec, rate: command.rate, effectiveServerTimeMs: Date.now() };
    } else throw new Error(`Unsupported Cinema fixture command: ${command.type}`);
    room.revision++; return response();
  }, exportBoard: async () => { throw new Error('No board in this local Cinema fixture.'); }, youtubePlayer: async () => { throw new Error('No YouTube or provider playback in this local fixture.'); } };
}

/** DEV-only video projection: static vector scene + explicit synthetic metadata, no media transport claim. */
export function installCinemaFixture(id: string, value: string): () => void {
  if (!import.meta.env.DEV) throw new Error('Cinema fixtures are unavailable in production.');
  const screen = id.toUpperCase(), variant = cinemaFixtureVariant(screen, value);
  const previous = useCinemaSession.getState();
  const share = screen === 'S27' || screen === 'S28' && variant === 'shared';
  const restoreMedia = installMediaFixture(share ? 'S22' : 'S19', share ? variant === 'presenter' ? 'default' : variant === 'source_lost' ? 'source_closed' : 'viewer' : 'default');
  const transport = mediaProvider(), bridge = mediaBridge();
  const room = cinemaFixtureRoom(screen, variant);
  if(screen==='S25'&&variant==='host_left'&&room.primary)room.primary.hostUserId='demo-mert';
  const adapter = createCinemaFixtureActivity(room);
  const projection = screen === 'S25' && variant === 'reconnect' ? {room, status:'error' as 'error'|'connected', error:'Demo fixture: connection unavailable.' as string|null, serverTimeMs:Date.now()} : undefined;
  const restoreRuntime = installDevelopmentRuntime({mediaProvider:transport,mediaBridge:bridge,activityBridge:adapter,...(projection?{activityState:projection}:{})});
  const elementCleanups: (()=>void)[] = [];
  if(screen==='S25'&&variant==='host_left'){const transfer=setTimeout(()=>{if(room.primary)room.primary.hostUserId='demo-ece';room.revision++;},250);elementCleanups.push(()=>clearTimeout(transfer));}
  let observer: MutationObserver | null = null;
  if (screen === 'S25' || screen === 'S26') {
    const item = room.queue[0]!;
    useCinemaSession.setState({media:{url:sourceUrl,name:item.media.title,binding:{roomId,itemId:item.id,referenceId:item.media.kind==='independent-source'?item.media.referenceId:'demo-film-1',timelineEpoch:1,title:item.media.title,sourceVersion}},choosing:false});
    const attach = () => {
      const video = document.querySelector<HTMLVideoElement>('.cinema-persistent video');
      if(!video||video.dataset.cinemaDemoFixture)return;
      video.dataset.cinemaDemoFixture = `${screen}/${variant}`;
      video.removeAttribute('src');
      video.poster='/__reference/01_brand/cinema-still.svg';
      let paused = true, time = screen === 'S26' && variant !== 'late' ? 0 : 2068;
      const duration = variant === 'mismatch' ? 5892 : 6120;
      Object.defineProperties(video,{duration:{configurable:true,get:()=>duration},readyState:{configurable:true,get:()=>variant==='matching'?1:4},paused:{configurable:true,get:()=>paused},currentTime:{configurable:true,get:()=>time,set:(next:number)=>{time=next;video.dispatchEvent(new Event('timeupdate'));}},load:{configurable:true,value:()=>{}},play:{configurable:true,value:async()=>{paused=false;video.dispatchEvent(new Event('play'));}},pause:{configurable:true,value:()=>{paused=true;video.dispatchEvent(new Event('pause'));}}});
      const publishMetadata=()=>{video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('canplay'));video.dispatchEvent(new Event('timeupdate'));};
      // The renderer's source effect runs after the fixture's MutationObserver.
      // Publish again after that effect clears the initial duration state.
      publishMetadata();const metadataTimer=setTimeout(publishMetadata,25);elementCleanups.push(()=>clearTimeout(metadataTimer));
      if(variant==='matching')video.dispatchEvent(new Event('waiting'));
      if(variant==='error')video.dispatchEvent(new Event('error'));
      if(screen==='S25'&&variant!=='reconnect'){
        // Reach ready state through the real confirmation control, not a production bypass.
        const prepare = () => {
          const input=document.querySelector<HTMLInputElement>('.cinema-source-check-confirm input');
          if(!input)return;
          input.click();
          const next=setTimeout(()=>{document.querySelector<HTMLButtonElement>('.cinema-source-check-footer .button.primary:not(:disabled)')?.click();const settled=setTimeout(()=>{if(variant==='buffering'||variant==='source_missing'){video.dispatchEvent(new Event(variant==='buffering'?'waiting':'error'));const dismiss=setTimeout(()=>{document.querySelector<HTMLButtonElement>('.cinema-source-check-footer .button.secondary')?.click();},100);elementCleanups.push(()=>clearTimeout(dismiss));}else document.querySelector<HTMLButtonElement>('.cinema-persistent .stage-play:not(:disabled)')?.click();},70);elementCleanups.push(()=>clearTimeout(settled));},0);
          elementCleanups.push(()=>clearTimeout(next));
        };
        const timer=setTimeout(prepare,80);elementCleanups.push(()=>clearTimeout(timer));
      }
    };
    observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();
  } else useCinemaSession.setState({media:null,choosing:false});
  const recover=(event:MouseEvent)=>{if(projection&&(event.target as HTMLElement).closest('button')?.textContent?.includes('Bağlantıyı kontrol et')){projection.status='connected';projection.error=null;}};
  document.addEventListener('click',recover,true);
  return ()=>{observer?.disconnect();elementCleanups.forEach(clean=>clean());document.removeEventListener('click',recover,true);restoreRuntime();restoreMedia();useCinemaSession.setState(previous,true);};
}
