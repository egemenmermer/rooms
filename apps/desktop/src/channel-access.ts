import { create } from 'zustand';
/** A permission change revokes cached previews before an authoritative recheck. */
export const useChannelAccess=create<{checks:Record<string,'checking'|'denied'|'unavailable'>}>(()=>({checks:{}}));
export function setChannelAccess(channelId:string,state:'checking'|'denied'|'unavailable'|null){useChannelAccess.setState(current=>{const checks={...current.checks};if(state)checks[channelId]=state;else delete checks[channelId];return {checks};});}
