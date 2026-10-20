import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
/** Real HTTPS referrer, visible official player; no audio extraction or remote URL fetching. */
export function registerYouTubePlayer(server: FastifyInstance) {
  server.get('/player/youtube', async (request, reply) => {
    const query = z
      .object({
        videoId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{11}$/)
          .optional(),
        playlistId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{10,128}$/)
          .optional(),
        nonce: z.string().uuid(),
        // `minimal`: the Tayfa cinema draws its own controls over the official player.
        chrome: z.enum(['minimal']).optional(),
      })
      .strict()
      .refine((v) => !!v.videoId !== !!v.playlistId)
      .safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'INVALID_PLAYER_REQUEST' });
    const { videoId, playlistId, nonce, chrome } = query.data;
    const playerVars = {
      playsinline: 1,
      fs: 0,
      enablejsapi: 1,
      rel: 0,
      iv_load_policy: 3,
      ...(chrome === 'minimal' ? { controls: 0, disablekb: 1, cc_load_policy: 0 } : {}),
    };
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'; connect-src https://www.youtube.com; img-src https://i.ytimg.com data:; base-uri 'none'; form-action 'none'",
      )
      .send(`<!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="player"></div><script>
const nonce=${JSON.stringify(nonce)},list=${JSON.stringify(playlistId ?? null)};let player,playlistTimer;const send=(event,data)=>parent.postMessage({type:'rooms-youtube',nonce,event,data},'*');
const report=()=>{const video=player.getVideoData();send('position',{positionSec:player.getCurrentTime(),state:player.getPlayerState(),durationSec:player.getDuration(),videoId:typeof video.video_id==='string'?video.video_id.slice(0,11):'',title:typeof video.title==='string'?video.title.slice(0,240):'',author:typeof video.author==='string'?video.author.slice(0,240):''});};
window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{videoId:${JSON.stringify(videoId ?? '')},width:'100%',height:'100%',playerVars:{...${JSON.stringify(playerVars)},origin:location.origin},events:{onReady:()=>{send('ready',{});if(list){player.cuePlaylist({listType:'playlist',list,index:0});let attempts=0;playlistTimer=setInterval(()=>{const ids=player.getPlaylist();if(Array.isArray(ids)&&ids.length){clearInterval(playlistTimer);send('playlist',{ids:ids.slice(0,101)});}else if(++attempts>=40){clearInterval(playlistTimer);send('playlist-error',{});}},500);}},onStateChange:e=>send('state',{state:e.data,positionSec:player.getCurrentTime()}),onError:e=>send('error',{code:e.data}),onAutoplayBlocked:()=>send('autoplay-blocked',{})}});};
window.addEventListener('message',event=>{const data=event.data;if(event.source!==parent||!data||data.type!=='rooms-youtube-command'||data.nonce!==nonce||!player)return;if(data.action==='play')player.playVideo();else if(data.action==='pause')player.pauseVideo();else if(data.action==='seek'&&Number.isFinite(data.positionSec)&&data.positionSec>=0&&data.positionSec<=86400)player.seekTo(data.positionSec,true);else if(data.action==='volume'&&Number.isFinite(data.volume)&&data.volume>=0&&data.volume<=100){player.setVolume(data.volume);if(data.volume>0)player.unMute();else player.mute();}else if(data.action==='position')report();});
window.addEventListener('pagehide',()=>clearInterval(playlistTimer));
</script><script src="https://www.youtube.com/iframe_api"></script></body></html>`);
  });
}
