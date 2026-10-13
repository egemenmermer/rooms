package rooms;
import com.sedmelluq.discord.lavaplayer.player.*;
import com.sedmelluq.discord.lavaplayer.player.event.AudioEventAdapter;
import com.sedmelluq.discord.lavaplayer.track.*;
import com.sedmelluq.discord.lavaplayer.track.playback.AudioFrame;
import com.sedmelluq.discord.lavaplayer.format.StandardAudioDataFormats;
import com.sedmelluq.discord.lavaplayer.tools.FriendlyException;
import dev.lavalink.youtube.YoutubeAudioSourceManager;
import dev.lavalink.youtube.clients.Web;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
/** Bounded source-to-PCM probe. One fixed WEB client; no fallback, credentials, proxy or room publication. */
public final class SourceProbe {
 static String kinds="";
 static String category(Throwable error){StringBuilder text=new StringBuilder(),types=new StringBuilder();var pending=new java.util.ArrayDeque<Throwable>();pending.add(error);var seen=java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Throwable,Boolean>());while(!pending.isEmpty()&&seen.size()<20){Throwable e=pending.remove();if(!seen.add(e))continue;text.append(e.getMessage()).append(' ');types.append(e.getClass().getSimpleName()).append('/');if(e instanceof FriendlyException){String reason=String.valueOf(e.getMessage()).replaceAll("https?://[^ ]+","[URL]").replaceAll("[^A-Za-z0-9 .:_-]"," ");types.append(reason.substring(0,Math.min(200,reason.length()))).append('/');}if(e.getCause()!=null)pending.add(e.getCause());if(e instanceof dev.lavalink.youtube.AllClientsFailedException all)pending.addAll(all.getClientExceptions());}kinds=types.toString();String s=text.toString().toLowerCase();if(s.contains("sign in")||s.contains("not a bot")||s.contains("403")||s.contains("429"))return "PROVIDER_ACCESS_REQUIRED";if(s.contains("cipher")||s.contains("signature"))return "SOURCE_DECIPHER_FAILED";if(s.contains("pkix")||s.contains("certificate"))return "TLS_FAILURE";if(s.contains("timed out")||s.contains("timeout"))return "TIMEOUT";return "SOURCE_FAILED";}

 public static void main(String[] args)throws Exception{
  if(args.length!=1||!args[0].matches("[A-Za-z0-9_-]{11}"))throw new IllegalArgumentException("Video ID required");
  var manager=new DefaultAudioPlayerManager();var source=new YoutubeAudioSourceManager(false,new Web());manager.registerSourceManager(source);manager.getConfiguration().setOutputFormat(StandardAudioDataFormats.DISCORD_PCM_S16_BE);
  var loaded=new CompletableFuture<AudioTrack>();var player=manager.createPlayer();var failure=new AtomicReference<Throwable>();player.addListener(new AudioEventAdapter(){@Override public void onTrackException(AudioPlayer p,AudioTrack t,FriendlyException e){failure.set(e);}});
  int frames=0;long samples=0;double square=0;String status="SOURCE_FAILED";boolean metadata=false;
  try{manager.loadItem("https://www.youtube.com/watch?v="+args[0],new AudioLoadResultHandler(){public void trackLoaded(AudioTrack track){loaded.complete(track);}public void playlistLoaded(AudioPlaylist list){loaded.completeExceptionally(new IllegalStateException("Unexpected playlist"));}public void noMatches(){loaded.completeExceptionally(new IllegalStateException("No match"));}public void loadFailed(FriendlyException e){loaded.completeExceptionally(e);}});
   AudioTrack track=loaded.get(25,TimeUnit.SECONDS);metadata=true;if(track.getInfo().isStream||track.getDuration()>7200000)throw new IllegalStateException("Outside bounded music scope");player.playTrack(track);long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
   while(frames<150&&System.nanoTime()<deadline&&failure.get()==null){AudioFrame frame=player.provide();if(frame==null){Thread.sleep(10);continue;}byte[] data=frame.getData();for(int i=0;i+1<data.length;i+=2){int n=(short)(((data[i]&255)<<8)|(data[i+1]&255));square+=(double)n*n;samples++;}frames++;}
   status=failure.get()!=null?category(failure.get()):frames>=150&&samples>0&&Math.sqrt(square/samples)>1?"PASS_PCM":"NO_AUDIBLE_PCM";
  }catch(Throwable e){status=category(e);}finally{player.destroy();manager.shutdown();}
  System.out.println("{\"source\":\""+args[0]+"\",\"engine\":\"youtube-source1.18.2/lavaplayer2.2.7\",\"client\":\"WEB_ONLY\",\"metadata\":"+metadata+",\"frames\":"+frames+",\"rms\":"+(samples>0?Math.sqrt(square/samples):0)+",\"result\":\""+status+"\",\"exceptionKinds\":\""+kinds+"\"}");
 }
}
