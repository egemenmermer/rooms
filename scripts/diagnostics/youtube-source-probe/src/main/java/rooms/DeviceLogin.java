package rooms;
import dev.lavalink.youtube.http.YoutubeOauth2Handler;
import com.sedmelluq.discord.lavaplayer.tools.io.HttpClientTools;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.net.URI;
/** Request only the upstream Google device-login screen. Never polls, grants, or logs tokens. */
public final class DeviceLogin {
 public static void main(String[] args)throws Exception{
  Path state=Path.of("/private/pending-device.json");if(Files.exists(state))throw new IllegalStateException("Existing pending device login must be reviewed first");
  var manager=HttpClientTools.createCookielessThreadLocalManager();
  try{var response=new YoutubeOauth2Handler(manager).fetchDeviceCode();String url=response.get("verification_url").text(),code=response.get("user_code").text();URI uri=URI.create(url);
   if(!java.util.Set.of("www.google.com","google.com","accounts.google.com","www.youtube.com").contains(uri.getHost())||uri.getUserInfo()!=null||!code.matches("[A-Z0-9-]{4,32}"))throw new IllegalStateException("Unexpected verification response");
   Files.createFile(state,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));Files.writeString(state,response.format(),StandardOpenOption.WRITE);
   System.out.println("{\"verificationUrl\":\""+url+"\",\"userCode\":\""+code+"\",\"expiresInSeconds\":"+response.get("expires_in").asLong(0)+",\"accountAuthorized\":false,\"tokenPolling\":false}");
  }finally{manager.close();}
 }
}
