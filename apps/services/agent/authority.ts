import type {ToolOperation} from './repository';
export class AgentApprovalRequired extends Error {constructor(readonly operation:ToolOperation){super('This operation awaits an authorized person’s approval.');}}
export class AgentUncertainEffect extends Error {constructor(readonly operationId:string){super('The previous operation may have completed. Review its external effects before resuming.');}}
export function redactPreview(value:unknown):string {return JSON.stringify(value, (key,item)=>/password|token|secret|authorization|cookie|api.?key/i.test(key)?'[private]':item).slice(0,4000);}
