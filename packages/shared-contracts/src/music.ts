import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const musicCommandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('add'),url:z.string().url().max(2048)}).strict(),
 z.object({type:z.literal('play')}).strict(),z.object({type:z.literal('pause')}).strict(),
 z.object({type:z.literal('next')}).strict(),z.object({type:z.literal('previous')}).strict(),
 z.object({type:z.literal('seek'),id:z.string().uuid(),positionSec:z.number().finite().min(0).max(7200)}).strict(),
 z.object({type:z.literal('stop')}).strict(),z.object({type:z.literal('remove'),id:z.string().uuid()}).strict(),
]);
export type MusicCommand=z.infer<typeof musicCommandSchema>;
export const musicSearchQuerySchema=z.string().trim().min(2).max(200).refine(value=>!/[\x00-\x1f\x7f]/.test(value),'Invalid search text');
export const musicSearchResultsSchema=z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_-]{11}$/),title:z.string().min(1).max(160),durationSec:z.number().finite().min(0).max(7200)}).strict()).max(5);
export type MusicSearchResult=z.infer<typeof musicSearchResultsSchema>[number];
export const musicSnapshotSchema=z.object({channelId:id,identity:id,status:z.enum(['disconnected','connecting','playing','paused','error']),queue:z.array(z.object({id:z.string().uuid(),title:z.string().max(160),durationSec:z.number().finite().min(0).max(7200)}).strict()).max(100),currentId:z.string().uuid().nullable(),positionSec:z.number().finite().min(0).max(7200),error:z.string().max(240).nullable()}).strict();
export type MusicSnapshot=z.infer<typeof musicSnapshotSchema>;
export const musicIdentity=(channelId:string)=>`rooms-music-${channelId.slice(0,96)}`;
