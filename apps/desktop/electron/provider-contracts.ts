export interface ProviderConnection { id:string;type:'playlist'|'xtream'|'real-debrid';name:string;status:'connected'|'auth-expired'|'error';channelCount:number }
export interface PersonalChannel {id:string;name:string;group:string;favorite:boolean}
export interface PersonalLibraryItem {id:string;name:string;size:number;mime:string}
export interface PersonalPlaylistSelection {token:string;fileName:string;channelCount:number}
export interface ProviderBridge {
 updatePlaylist(input:{id:string;name:string;url?:string;token?:string;xmltvUrl?:string|null}):Promise<ProviderConnection>;
 updateXtream(input:{id:string;name:string;serverUrl?:string;username?:string;password?:string}):Promise<ProviderConnection>;
 rdCancel():Promise<void>;
 pickPlaylist():Promise<PersonalPlaylistSelection|null>;
 playlistFile(input:{name:string;token:string;xmltvUrl?:string}):Promise<ProviderConnection>;
 status():Promise<ProviderConnection[]>;
 connectPlaylist(input:{name:string;url:string;xmltvUrl?:string}):Promise<ProviderConnection>;
 connectXtream(input:{name:string;serverUrl:string;username:string;password:string}):Promise<ProviderConnection>;
 epg(connectionId:string,channelId:string):Promise<{title:string;description:string;startsAt:string;endsAt:string}[]>;
 channels(connectionId:string):Promise<PersonalChannel[]>;
 favorite(connectionId:string,channelId:string,value:boolean):Promise<void>;
 play(connectionId:string,channelId:string):Promise<{url:string;name:string;live:boolean;startAt?:number}>;
 saveResume(url:string,position:number):Promise<void>;
 disconnect(id:string):Promise<void>;
 rdStart():Promise<{userCode:string;verificationUrl:string;expiresAt:string;interval:number}>;
 rdPoll():Promise<{state:'pending'|'connected'|'expired'}>;
 rdLibrary():Promise<PersonalLibraryItem[]>;
 rdPlay(id:string):Promise<{url:string;name:string;live:boolean;startAt?:number}>;
}
