package rooms;
import com.sedmelluq.discord.lavaplayer.player.*;
import com.sedmelluq.discord.lavaplayer.player.event.AudioEventAdapter;
import com.sedmelluq.discord.lavaplayer.track.*;
import com.sedmelluq.discord.lavaplayer.tools.*;
import com.sedmelluq.discord.lavaplayer.format.StandardAudioDataFormats;
import dev.lavalink.youtube.YoutubeAudioSourceManager;
import dev.lavalink.youtube.clients.Tv;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.concurrent.atomic.AtomicReference;
/** Explicit owner-approved dedicated-account diagnostic; no fallback or room publication. */
public final class OAuthSourceProbe {
 static String diagnostic=""; static String trace="";
 static String classify(Throwable e){
  var queue=new java.util.ArrayDeque<Throwable>();queue.add(e);int count=0;
  while(!queue.isEmpty()&&count++<12){var item=queue.remove();trace+=item.getClass().getSimpleName()+":";for(var frame:item.getStackTrace()){if(frame.getClassName().startsWith("dev.lavalink")||frame.getClassName().startsWith("com.sedmelluq")){trace+=frame.getClassName()+"."+frame.getMethodName()+":"+frame.getLineNumber()+";";break;}}if(item.getCause()!=null)queue.add(item.getCause());if(item instanceof dev.lavalink.youtube.AllClientsFailedException all)queue.addAll(all.getClientExceptions());}
  String category=SourceProbe.category(e);String detail=SourceProbe.kinds.toLowerCase();
  diagnostic=detail.contains("login")?"LOGIN_REQUIRED":detail.contains("format")?"FORMAT_UNAVAILABLE":detail.contains("bot")?"BOT_CHECK":detail.contains("unplayable")?"UNPLAYABLE":detail.contains("unsupported")?"UNSUPPORTED":detail.contains("restricted")?"RESTRICTED":detail.contains("cipher")?"CIPHER":detail.contains("suspicious")?"SUSPICIOUS_REQUEST":detail.contains("unavailable")||detail.contains("not available")?"NOT_AVAILABLE":"UNCLASSIFIED";
  return category;
 }
 public static void main(String[] args) {
  if(args.length!=1||!args[0].matches("[A-Za-z0-9_-]{11}"))throw new IllegalArgumentException("Video ID required");
  var manager=new DefaultAudioPlayerManager();var source=new YoutubeAudioSourceManager(false,new Tv());
  var player=manager.createPlayer();var failure=new AtomicReference<Throwable>();
  boolean authorized=false;int frames=0;long samples=0;double square=0;String result="AUTH_FAILED";
  try {
   Path token=Path.of("/private/refresh-token");
   if(!Files.exists(token)) {
    var pending=JsonBrowser.parse(Files.readString(Path.of("/private/pending-device.json")));
    var response=source.getOauth2Handler().fetchRefreshToken(pending.get("device_code").text());
    String refresh=response.get("refresh_token").text();
    if(refresh==null||refresh.isBlank())throw new IllegalStateException("No refresh token");
    Path temporary=Path.of("/private/refresh-token.new");
    Files.createFile(temporary,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
    Files.writeString(temporary,refresh);Files.move(temporary,token,StandardCopyOption.ATOMIC_MOVE);
   }
   source.useOauth2(Files.readString(token),true);
   authorized=source.getOauth2Handler().hasAccessToken();
   if(!authorized)throw new IllegalStateException("No access token");
   result="SOURCE_FAILED";manager.registerSourceManager(source);
   manager.getConfiguration().setOutputFormat(StandardAudioDataFormats.DISCORD_PCM_S16_BE);
   player.addListener(new AudioEventAdapter(){@Override public void onTrackException(AudioPlayer p,AudioTrack t,FriendlyException e){failure.set(e);}});
   // TV supports authorized playback but not metadata lookup. This identifier-only descriptor
   // makes no title/duration claim and is limited by the external and frame deadlines below.
   var track=source.buildAudioTrack(new AudioTrackInfo("Owner-selected source","Unknown",0,args[0],false,"https://www.youtube.com/watch?v="+args[0]));
   player.playTrack(track);long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
   while(frames<150&&System.nanoTime()<deadline&&failure.get()==null){var frame=player.provide();if(frame==null){Thread.sleep(10);continue;}byte[] data=frame.getData();for(int i=0;i+1<data.length;i+=2){int n=(short)(((data[i]&255)<<8)|(data[i+1]&255));square+=(double)n*n;samples++;}frames++;}
   result=failure.get()!=null?classify(failure.get()):frames>=150&&samples>0&&Math.sqrt(square/samples)>1?"PASS_PCM":"NO_AUDIBLE_PCM";
  }catch(Throwable e){if(authorized)result=classify(e);}
  finally{player.destroy();manager.shutdown();source.shutdown();}
  System.out.println("{\"source\":\""+args[0]+"\",\"client\":\"TV_OAUTH_ONLY\",\"authorized\":"+authorized+",\"frames\":"+frames+",\"rms\":"+(samples>0?Math.sqrt(square/samples):0)+",\"result\":\""+result+"\",\"diagnostic\":\""+diagnostic+"\",\"trace\":\""+trace+"\",\"roomPublished\":false}");
 }
}
