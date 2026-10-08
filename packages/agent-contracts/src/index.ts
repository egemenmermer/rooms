export type AgentProvider = 'openrouter' | 'codex' | 'claude';
export type AgentTaskState = 'scheduled' | 'queued' | 'running' | 'awaiting-approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface ModelConnection { id:string; ownerId:string; provider:AgentProvider; label:string; model:string; status:'connected'|'login-required'|'unavailable'; reason?:string }
export interface AgentArtifact { id:string; name:string; mime:string; size:number }
export interface AgentTask { kind?:'model'|'reminder'; uncertainOperation?:{operationId:string;description:string;tool:string;preview:string}; pendingApproval?:{operationId:string;description:string;tool:string;preview:string}; id:string; roomId:string; ownerId:string; prompt:string; modelConnectionId:string; state:AgentTaskState; progress:string[]; result:string|null; artifacts:AgentArtifact[]; createdAt:string; runAt:string|null; error:string|null }
export interface AgentStatus {configured:boolean; connected:boolean; userId?:string; yolo:boolean; executionHost:'separate-server'; capabilities:string[]; reason?:string}
export interface AgentMemory {id:string;roomId:string;authorId:string;text:string;sourceMessageId:string|null;createdAt:string}
export interface AgentBridge {
 configure(input:{url:string;token:string}):Promise<void>;
 status():Promise<AgentStatus>;
 tasks(roomId:string):Promise<AgentTask[]>;
 submit(input:{roomId:string;prompt:string;modelConnectionId:string;runAt?:string}):Promise<AgentTask>;
 remind(input:{roomId:string;channelId:string;sourceMessageId:string;text:string;runAt:string}):Promise<AgentTask>;
 cancel(id:string):Promise<AgentTask>;
 approve(id:string):Promise<AgentTask>;
 resolveOperation(id:string,input:{operationId:string;resolution:'record-result'|'confirm-not-applied';result?:string}):Promise<AgentTask>;
 connections():Promise<ModelConnection[]>;
 connectModel(input:{provider:AgentProvider;label:string;model:string;apiKey?:string}):Promise<ModelConnection>;
 disconnectModel(id:string):Promise<void>;
 yolo(value:boolean):Promise<AgentStatus>;
 memory(roomId:string):Promise<AgentMemory[]>;
 saveMemory(input:{roomId:string;text:string;sourceMessageId?:string}):Promise<AgentMemory>;
 deleteMemory(id:string):Promise<void>;
 downloadArtifact(taskId:string,artifactId:string):Promise<boolean>;
}
