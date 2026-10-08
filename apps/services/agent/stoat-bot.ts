import {StoatClient,type SocialMessage} from '@rooms/stoat';
/** Official bot-token mode only; never user account automation or ordinary-message ingestion. */
export interface StoatMention {messageId:string;channelId:string;authorId:string;content:string}
export function mentionedStoatBot(message:SocialMessage,botId:string){return message.author.bot!==true&&message.author.id!==botId&&!!message.mentions?.includes(botId)&&typeof message.content==='string';}
export async function connectStoatBot(config:{serverUrl:string;token:string;authorizedAuthorIds:Set<string>;onMention:(input:StoatMention)=>Promise<string>}){
 const client=new StoatClient(config.serverUrl,config.token,{botToken:true});
 const bot=await client.getCurrentUser();if(!bot.bot)throw new Error('The configured Stoat credential does not identify an official bot.');
 let stopped=false;
 const unsubscribe=client.subscribe(event=>{
  if(stopped||event.type!=='MESSAGE_CREATE')return;const message=event.data as SocialMessage;
  if(!mentionedStoatBot(message,bot.id)||!config.authorizedAuthorIds.has(message.author.id))return;
  const content=message.content.split(`<@${bot.id}>`).join('').trim().slice(0,20000);if(!content)return;
  void config.onMention({messageId:message.id,channelId:message.channelId,authorId:message.author.id,content}).then(async reply=>{if(!stopped&&reply.trim())await client.sendMessage(message.channelId,reply.slice(0,1900));}).catch(()=>{/* No credential-bearing errors or unauthorized input are logged. */});
 });
 try{await client.connect();}catch(error){unsubscribe();await client.disconnect();throw error;}
 return()=>{stopped=true;unsubscribe();void client.disconnect();};
}

/** Outbox delivery. Stable key/nonce is upstream-supported; unknown outcomes must not be blindly replayed. */
export async function sendStoatReply(input:{serverUrl:string;token:string;channelId:string;messageId:string;content:string;deliveryId:string}){
 const client=new StoatClient(input.serverUrl,input.token,{botToken:true});const bot=await client.getCurrentUser();if(!bot.bot)throw new Error('Official Stoat bot token required.');
 await client.sendReply(input.channelId,input.messageId,input.content.slice(0,1900),input.deliveryId);
}
