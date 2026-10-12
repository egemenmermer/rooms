import {AgentSchedulesSurface,type AgentSchedulesProps} from '../Agent';
import type {AgentTask,ModelConnection} from '../../../../packages/agent-contracts/src';
/** Explicit DEV projection. No bridge is supplied, so account mutations are impossible. */
export const S62_VARIANTS=['default','create','created','cancel','cancelled','completed','failed','empty'] as const;
export function getS62Fixture(variant:string):AgentSchedulesProps{
 if(!S62_VARIANTS.includes(variant as typeof S62_VARIANTS[number]))throw new Error(`Unsupported S62 variant: ${variant}`);
 const model:ModelConnection={id:'s62-demo-model',ownerId:'s62-demo-owner',provider:'openrouter',label:'OpenRouter / Araştırma',model:'demo-model',status:'connected'};
 const task:AgentTask={id:'s62-demo-task',roomId:'s62-demo-room',ownerId:model.ownerId,modelConnectionId:model.id,prompt:'Film gecesi planını hazırla',createdAt:'2026-10-10T17:00:00Z',runAt:'2026-10-10T19:00:00Z',state:variant==='cancelled'?'cancelled':variant==='completed'?'completed':variant==='failed'?'failed':'scheduled',progress:[],result:variant==='completed'?'Yerel demo sonucu':null,artifacts:[],error:variant==='failed'?'Kişisel model bağlantısı kullanılamıyor.':null};
 const tasks:AgentTask[]=[{...task,id:'s62-demo-history-1',prompt:'Hafta sonu planını özetle',state:'completed',runAt:'2026-10-09T18:00:00Z',createdAt:'2026-10-09T16:00:00Z'},{...task,id:'s62-demo-history-2',prompt:'İzleme listesini düzenle',state:'completed',runAt:'2026-10-08T17:30:00Z',createdAt:'2026-10-08T16:00:00Z'}];
 if(variant!=='empty')tasks.unshift(task);
 return{tasks,models:[model],userId:model.ownerId,roomId:task.roomId,roomName:'Bizim Oda',channelName:'genel',ready:true,fixture:true,fixtureView:variant,onRefresh:async()=>{},initialPrompt:variant==='create'?'Bu odadaki film gecesi kararlarını özetle ve plan dosyasını hazırla.':'',initialDate:'2026-10-10',initialTime:'21:00',fixtureNotice:variant==='created'?'Yerel demo: Görev planlandı. 10 Ekim 2026 · 21.00 · Europe/Amsterdam · Bir kez.':undefined};
}
export default function S62SchedulesEntry(){const query=new URLSearchParams(window.location.search),variant=query.get('variant')||'default';return <AgentSchedulesSurface {...getS62Fixture(variant)}/>;}
