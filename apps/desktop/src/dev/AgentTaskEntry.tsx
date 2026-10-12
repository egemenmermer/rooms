import {useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import type {AgentBridge} from '@rooms/agent-contracts';
import AgentTaskSurface from '../AgentTaskSurface';
import {getAgentTaskFixture} from './agent-task-fixture';
const denied=async():Promise<never>=>{throw new Error('Local Agent fixtures cannot invoke native or account operations.');};
const bridge:AgentBridge={configure:denied,status:denied,authority:denied,audit:denied,tasks:denied,submit:denied,remind:denied,cancel:denied,approve:denied,resolveOperation:denied,connections:denied,connectModel:denied,disconnectModel:denied,yolo:denied,memory:denied,saveMemory:denied,deleteMemory:denied,previewArtifact:denied,downloadArtifact:denied};
/** Explicit production component projection; no native bridge replacement or account access. */
export default function AgentTaskEntry({notify}:{notify(message:string):void}){
 const navigate=useNavigate();
 const fixture=useMemo(()=>{const params=new URLSearchParams(window.location.search);return getAgentTaskFixture(params.get('fixture')||'',params.get('variant')||'default');},[]);
 return <AgentTaskSurface {...fixture} initialModal={fixture.modal} fixture bridge={bridge} notify={notify} onRefresh={denied} onReturn={()=>navigate('/chat')} scopeKey={`${fixture.metadata.id}:${fixture.metadata.variant}`} onManageConnection={()=>navigate('/agent?tab=models')} onHistory={()=>navigate('/settings?tab=assistant-permissions&view=history')}/>;
}
