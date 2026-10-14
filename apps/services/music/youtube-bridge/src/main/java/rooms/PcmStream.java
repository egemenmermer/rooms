package rooms;
import com.sedmelluq.discord.lavaplayer.player.*;
import com.sedmelluq.discord.lavaplayer.player.event.AudioEventAdapter;
import com.sedmelluq.discord.lavaplayer.track.*;
import com.sedmelluq.discord.lavaplayer.tools.FriendlyException;
import com.sedmelluq.discord.lavaplayer.format.StandardAudioDataFormats;
import dev.lavalink.youtube.YoutubeAudioSourceManager;
import dev.lavalink.youtube.YoutubeSourceOptions;
import dev.lavalink.youtube.clients.Tv;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicReference;
/** Server-only, single authorized source to stereo PCM. Never emits credentials or signed URLs. */
public final class PcmStream {
 static final class GuardedTv extends Tv {
  String title,author;long duration;boolean detailsPresent,videoMatches,live,licensed;
  @Override protected com.sedmelluq.discord.lavaplayer.tools.JsonBrowser loadTrackInfoFromInnertube(YoutubeAudioSourceManager s,com.sedmelluq.discord.lavaplayer.tools.io.HttpInterface h,String id,dev.lavalink.youtube.clients.skeleton.Client.PlayabilityStatus status,boolean strict)throws dev.lavalink.youtube.CannotBeLoaded,java.io.IOException {
   var json=super.loadTrackInfoFromInnertube(s,h,id,status,strict);var details=json.get("videoDetails");
   long length=details.get("lengthSeconds").asLong(0);duration=length;detailsPresent=!details.isNull();videoMatches=id.equals(details.get("videoId").text());live=details.get("isLive").asBoolean(false);licensed=!json.get("streamingData").get("licenseInfos").values().isEmpty();
   if(!id.equals(details.get("videoId").text())||details.get("isLive").asBoolean(false)||length<=0||length>7200||!json.get("streamingData").get("licenseInfos").values().isEmpty())throw new IllegalStateException("MUSIC_SOURCE_TOO_LARGE");
   title=details.get("title").safeText();author=details.get("author").safeText();duration=length;return json;
  }
 }

 public static void main(String[] args) {
  if(args.length!=2||!args[0].matches("[A-Za-z0-9_-]{11}")){System.err.println("MUSIC_SOURCE_FAILED");System.exit(1);}
  boolean metadata=args[1].equals("metadata");double offset;
  try{offset=metadata?0:Double.parseDouble(args[1]);if(!Double.isFinite(offset)||offset<0||offset>7200)throw new IllegalArgumentException();}catch(Exception e){System.err.println("MUSIC_SOURCE_FAILED");System.exit(1);return;}
  var manager=new DefaultAudioPlayerManager();
  var tv=new GuardedTv();var source=new YoutubeAudioSourceManager(new YoutubeSourceOptions().setAllowSearch(false).setRemoteCipher("http://music-cipher:8001/",null,"ROOMS-private-music"),tv);
  var player=manager.createPlayer();var failure=new AtomicReference<Throwable>();int exit=0;String stage="AUTH";
  Runtime.getRuntime().addShutdownHook(new Thread(()->{player.destroy();manager.shutdown();source.shutdown();}));
  try{
   Path token=Path.of("/private/refresh-token");if(!Files.isRegularFile(token)||Files.size(token)>16384||(Files.getPosixFilePermissions(token).stream().anyMatch(x->x.name().startsWith("GROUP_")||x.name().startsWith("OTHERS_"))))throw new IllegalStateException("AUTH");
   source.useOauth2(Files.readString(token),true);if(!source.getOauth2Handler().hasAccessToken())throw new IllegalStateException("AUTH");
   stage="METADATA";try(var http=source.getInterface()){
    http.getContext().setAttribute(dev.lavalink.youtube.clients.skeleton.Client.OAUTH_CLIENT_ATTRIBUTE,true);
    tv.loadFormats(source,http,args[0]);
   }
   if(metadata){var output=com.sedmelluq.discord.lavaplayer.tools.JsonBrowser.newMap();output.put("title",tv.title);output.put("durationSec",tv.duration);System.out.println(output.format());return;}
   stage="DECODE";manager.registerSourceManager(source);manager.getConfiguration().setOutputFormat(StandardAudioDataFormats.DISCORD_PCM_S16_BE);
   var ended=new AtomicReference<AudioTrackEndReason>();
   player.addListener(new AudioEventAdapter(){
    @Override public void onTrackException(AudioPlayer p,AudioTrack t,FriendlyException e){failure.set(e);}
    @Override public void onTrackEnd(AudioPlayer p,AudioTrack t,AudioTrackEndReason reason){ended.set(reason);}
   });
   var track=source.buildAudioTrack(new AudioTrackInfo(tv.title,tv.author,tv.duration*1000,args[0],false,"https://www.youtube.com/watch?v="+args[0]));
   track.setPosition((long)(offset*1000));player.playTrack(track);
   long frames=0,last=System.nanoTime();boolean started=false;
   while(frames<360000&&failure.get()==null){
    var frame=player.provide();
    // DefaultAudioPlayer consumes the terminator and clears the executor before getState()
    // can report FINISHED. Its end event is the authoritative completion signal.
    if(frame==null){if(started&&ended.get()==AudioTrackEndReason.FINISHED)break;if(ended.get()!=null)throw new IllegalStateException("SOURCE");if(System.nanoTime()-last>java.util.concurrent.TimeUnit.SECONDS.toNanos(60))throw new IllegalStateException("TIMEOUT");Thread.sleep(5);continue;}
    byte[] data=frame.getData();for(int i=0;i+1<data.length;i+=2){byte a=data[i];data[i]=data[i+1];data[i+1]=a;}
    System.out.write(data);if(System.out.checkError())break;frames++;started=true;last=System.nanoTime();
   }
   if(failure.get()!=null||!started)throw new IllegalStateException("SOURCE");
  }catch(dev.lavalink.youtube.CannotBeLoaded|Exception e){System.err.println("MUSIC_YOUTUBE_UNAVAILABLE");System.err.println("DIAGNOSTIC_"+stage+"_"+e.getClass().getSimpleName()+"_details="+tv.detailsPresent+"_match="+tv.videoMatches+"_duration="+tv.duration+"_live="+tv.live+"_licensed="+tv.licensed);exit=1;}
  finally{player.destroy();manager.shutdown();source.shutdown();}
  System.exit(exit);
 }
}
