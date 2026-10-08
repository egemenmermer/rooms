import {describe,it,expect} from 'vitest';
import {mentionedStoatBot} from '../apps/services/agent/stoat-bot';
const message={id:'message',channelId:'channel',author:{id:'friend',username:'Friend',displayName:'Friend',avatar:null},content:'<@bot> Prepare tonight',timestamp:'2026-10-08T00:00:00Z',editedTimestamp:null,mentions:['bot']};
describe('official Stoat bot mention boundary',()=>{
 it('processes only actual mention metadata and never bot/self messages',()=>{expect(mentionedStoatBot(message,'bot')).toBe(true);expect(mentionedStoatBot({...message,mentions:[]},'bot')).toBe(false);expect(mentionedStoatBot({...message,author:{...message.author,bot:true}},'bot')).toBe(false);expect(mentionedStoatBot({...message,author:{...message.author,id:'bot'}},'bot')).toBe(false);});
});
