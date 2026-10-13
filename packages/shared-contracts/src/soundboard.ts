import {z} from 'zod';
export const soundboardClipSchema=z.object({id:z.string().uuid(),name:z.string().min(1).max(40),durationSec:z.number().positive().max(8),ownerId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)}).strict();
export const soundboardCatalogSchema=z.object({communityId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),clips:z.array(soundboardClipSchema).max(32),canUpload:z.boolean(),canManage:z.boolean()}).strict();
export type SoundboardClip=z.infer<typeof soundboardClipSchema>;
export type SoundboardCatalog=z.infer<typeof soundboardCatalogSchema>;
export interface SoundboardBridge {list(channelId:string):Promise<SoundboardCatalog>;upload(channelId:string,input:{name:string;audio:string}):Promise<SoundboardClip>;read(channelId:string,clipId:string):Promise<string>;remove(channelId:string,clipId:string):Promise<void>}
