import { PersonalMedia } from '../PersonalMedia';
import { getPersonalMediaFixtureSeed } from './personal-media-fixture';

/** Reuses the production component with the opt-in local metadata adapter. */
export default function PersonalMediaEntry({notify}:{notify(message:string):void}){
 const seed=getPersonalMediaFixtureSeed();
 if(!import.meta.env.DEV||!seed)throw new Error('Personal media fixture is not installed.');
 return <PersonalMedia notify={notify} initialView={seed.initialView} initialDialog={seed.initialDialog} initialConnectionId={seed.selectedConnectionId} initialEditId={seed.intent.screen==='S34'&&seed.intent.variant==='edit'?seed.selectedConnectionId:null} initialRemoveId={seed.intent.screen==='S34'&&seed.intent.variant==='remove'?seed.selectedConnectionId:null}/>;
}
