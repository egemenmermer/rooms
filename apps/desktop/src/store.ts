import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActivitySession } from '@rooms/contracts';
import { castVote } from '@rooms/activities';
export interface Message { id: string; author: string; text: string; time: string; own: boolean; reactions: number }
export interface Space { id: string; name: string; initials: string; tone: string; description: string }
export interface Preferences { pushToTalk: boolean; reduceMotion: boolean; reduceTransparency: boolean; compact: boolean; showFriends: boolean; demoFixtures: boolean; serverUrl: string; inputId: string; outputId: string; displayName: string; notifications: boolean; accent: 'pearl' | 'sage'; }
const demoMessages: Message[] = [
  { id: 'm1', author: 'Maya', text: 'Sakin bir akşam, güzel bir film. Kimler geliyor?', time: '20:42', own: false, reactions: 2 },
  { id: 'm2', author: 'Oliver', text: 'Ben varım. Tartışmalı film yorumlarımı da getiriyorum.', time: '20:44', own: false, reactions: 0 },
  { id: 'm3', author: 'Alex', text: 'Tam bizim sevdiğimiz gibi bir akşam.', time: '20:45', own: true, reactions: 0 },
  { id: 'm4', author: 'Sofia', text: 'Beş dakika verin. Önce çay, sonra sinema.', time: '20:46', own: false, reactions: 1 },
];
interface RoomsState {
  preferences: Preferences; spaces: Space[]; activeSpace: string; channel: string;
  messages: Record<string, Message[]>; voiceRoom: string | null; muted: boolean; deafened: boolean;
  polls: ActivitySession[]; queue: { id: string; title: string }[];
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  setSpace(id: string): void; setChannel(channel: string): void; addSpace(name: string): void;
  sendMessage(text: string): void; editMessage(id: string, text: string): void; deleteMessage(id: string): void; react(id: string): void;
  joinPreview(name: string): void; leavePreview(): void; toggleMute(): void; toggleDeafen(): void;
  createPoll(question: string, options: string[]): string; vote(pollId: string, optionId: string): void;
  addQueue(title: string): void; removeQueue(id: string): void; moveQueue(id: string, direction: -1 | 1): void;
}
export const useRooms = create<RoomsState>()(persist((set, get) => ({
  preferences: { pushToTalk: false, reduceMotion: false, reduceTransparency: false, compact: false, showFriends: true, demoFixtures: true, serverUrl: '', inputId: '', outputId: '', displayName: 'Alex', notifications: false, accent: 'pearl' },
  spaces: [
    { id: 'clubhouse', name: 'Kulüp', initials: 'C', tone: 'sand', description: 'İnternette bize ait küçük bir köşe.' },
    { id: 'afterhours', name: 'Gece Kuşları', initials: 'A', tone: 'lavender', description: 'Geceye uzayan sohbetler için.' },
    { id: 'weekenders', name: 'Hafta Sonu', initials: 'W', tone: 'sage', description: 'Plan yok. Güzel insanlar var.' },
  ], activeSpace: 'clubhouse', channel: 'general', messages: { 'clubhouse:general': demoMessages }, voiceRoom: null, muted: false, deafened: false,
  polls: [], queue: [{ id: 'scene', title: 'Mavi saat — özgün yerel demo' }],
  setPreference: (key, value) => set(state => ({ preferences: { ...state.preferences, [key]: value } })),
  setSpace: activeSpace => set({ activeSpace, channel: 'general' }), setChannel: channel => set({ channel }),
  addSpace: name => set(state => ({ spaces: [...state.spaces, { id: crypto.randomUUID(), name: name.trim().slice(0,40), initials: name.trim().slice(0,1).toUpperCase(), tone: 'sage', description: 'Yeni yerel demo mekânın.' }] })),
  sendMessage: text => { const s = get(); const key = `${s.activeSpace}:${s.channel}`; set({ messages: { ...s.messages, [key]: [...(s.messages[key] ?? []), { id: crypto.randomUUID(), author: s.preferences.displayName, text: text.trim().slice(0,4000), time: new Date().toLocaleTimeString('tr-TR', { hour: 'numeric', minute: '2-digit' }), own: true, reactions: 0 }].slice(-500) } }); },
  editMessage: (id, text) => { const s=get(); const key=`${s.activeSpace}:${s.channel}`; set({ messages: { ...s.messages, [key]: (s.messages[key] ?? []).map(m => m.id===id && m.own ? { ...m, text: text.trim().slice(0,4000) } : m) } }); },
  deleteMessage: id => { const s=get(); const key=`${s.activeSpace}:${s.channel}`; set({ messages: { ...s.messages, [key]: (s.messages[key] ?? []).filter(m => m.id!==id || !m.own) } }); },
  react: id => { const s=get(); const key=`${s.activeSpace}:${s.channel}`; set({ messages: { ...s.messages, [key]: (s.messages[key] ?? []).map(m => m.id===id ? { ...m, reactions: m.reactions===0 ? 1 : 0 } : m) } }); },
  joinPreview: voiceRoom => set({ voiceRoom }), leavePreview: () => set({ voiceRoom: null }),
  toggleMute: () => set(state => ({ muted: !state.muted })), toggleDeafen: () => set(state => ({ deafened: !state.deafened })),
  createPoll: (question, options) => { const id=crypto.randomUUID(); set(state => ({ polls: [...state.polls, { id, roomId: state.activeSpace, activityId: 'poll', hostUserId: 'local-user', controllerUserId: null, revision: 1, state: 'live', startedAt: new Date().toISOString(), payload: { type: 'poll', question, options: options.map(label => ({ id: crypto.randomUUID(), label })), votes: {} } }] })); return id; },
  vote: (pollId, optionId) => set(state => ({ polls: state.polls.map(p => p.id===pollId ? castVote(p, 'local-user', optionId) : p) })),
  addQueue: title => set(state => ({ queue: [...state.queue, { id: crypto.randomUUID(), title: title.slice(0,100) }].slice(0,100) })),
  removeQueue: id => set(state => ({ queue: state.queue.filter(item => item.id!==id) })),
  moveQueue: (id, direction) => set(state => { const queue=[...state.queue]; const i=queue.findIndex(item=>item.id===id); const j=i+direction; if (i>=0 && j>=0 && j<queue.length) [queue[i],queue[j]]=[queue[j]!,queue[i]!]; return { queue }; }),
}), { name: 'rooms-local-v1', partialize: state => ({ preferences: state.preferences, spaces: state.spaces, activeSpace: state.activeSpace, channel: state.channel, messages: state.messages, polls: state.polls, queue: state.queue }) }));
