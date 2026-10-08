import type { ConnectionStatus } from '@rooms/contracts';

export interface SocialUser { id: string; username: string; displayName: string; avatar: string | null; }
export interface SocialSpace { id: string; name: string; icon: string | null; ownerId?: string; }
export interface SocialChannel { id: string; spaceId: string | null; name: string; type: number; topic: string | null; recipients?: SocialUser[]; }
export interface SocialMessage { id: string; channelId: string; author: SocialUser; content: string; timestamp: string; editedTimestamp: string | null; }
export interface SocialInvite { code: string; space: SocialSpace | null; channel: SocialChannel | null; expiresAt: string | null; }
export interface GatewayEvent { type: string; data: unknown; }
type Raw = Record<string, any>;
export class SpacebarError extends Error {
  constructor(public status: number, public code: string) { super(status === 401 ? 'Your session expired. Sign in again.' : status === 403 ? 'You do not have permission for this action.' : status === 404 ? 'This room, message or invitation is unavailable.' : status === 429 ? 'Too many requests. Please wait and retry.' : status >= 500 ? 'The social server is unavailable. Retry shortly.' : 'The social server rejected this request. Check the supplied details.'); this.name = 'SpacebarError'; }
}
export function validateInstanceUrl(value: string, trustedInternalOrigin = false): string {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !((local || trustedInternalOrigin) && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Use an HTTPS server origin, or HTTP loopback for local development, without credentials or paths.');
  return url.origin;
}
const user = (u: Raw): SocialUser => ({ id: String(u.id), username: String(u.username ?? ''), displayName: String(u.global_name ?? u.username ?? ''), avatar: typeof u.avatar === 'string' ? u.avatar : null });
const space = (g: Raw): SocialSpace => ({ id: String(g.id), name: String(g.name ?? ''), icon: typeof g.icon === 'string' ? g.icon : null, ...(g.owner_id ? { ownerId: String(g.owner_id) } : {}) });
const channel = (c: Raw): SocialChannel => ({ id: String(c.id), spaceId: c.guild_id ? String(c.guild_id) : null, name: String(c.name ?? 'Direct message'), type: Number(c.type), topic: typeof c.topic === 'string' ? c.topic : null, ...(Array.isArray(c.recipients) ? { recipients: c.recipients.map(user) } : {}) });
const message = (m: Raw): SocialMessage => ({ id: String(m.id), channelId: String(m.channel_id), author: user(m.author ?? {}), content: String(m.content ?? ''), timestamp: String(m.timestamp), editedTimestamp: m.edited_timestamp ?? null });
const invite = (i: Raw): SocialInvite => ({ code: String(i.code), space: i.guild ? space(i.guild) : null, channel: i.channel ? channel(i.channel) : null, expiresAt: i.expires_at ?? null });

/** Lives in Electron main. Authorization never crosses the preload boundary. */
export class SpacebarClient {
  readonly instanceUrl: string;
  status: ConnectionStatus = 'not-configured';
  private token: string | null;
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ack = true;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private stopped = true;
  private attempt = 0;
  private listeners = new Set<(event: GatewayEvent) => void>();
  constructor(instanceUrl: string, token?: string, options?: { trustedInternalOrigin?: boolean }) { this.instanceUrl = validateInstanceUrl(instanceUrl, options?.trustedInternalOrigin === true); this.token = token ?? null; }
  getToken(): string | null { return this.token; }
  subscribe(listener: (event: GatewayEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(type: string, data: unknown) { for (const listener of this.listeners) listener({ type, data }); }
  private setStatus(status: ConnectionStatus) { this.status = status; this.emit('CONNECTION_STATUS', status); }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try { response = await fetch(`${this.instanceUrl}/api/v9${path}`, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: this.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new SpacebarError(503, 'NETWORK_UNAVAILABLE'); }
    if (!response.ok) { const data = await response.json().catch(() => ({})) as Raw; throw new SpacebarError(response.status, String(data.code ?? 'REQUEST_FAILED')); }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  async login(email: string, password: string): Promise<SocialUser> { const result = await this.request<Raw>('/auth/login', 'POST', { login: email, password }); if (typeof result.token !== 'string') throw new SpacebarError(400, 'ADDITIONAL_AUTHENTICATION_REQUIRED'); this.token = result.token; return this.getCurrentUser(); }
  async register(input: { email: string; password: string; username: string; inviteCode: string }): Promise<SocialUser> { const result = await this.request<Raw>('/auth/register', 'POST', { email: input.email, password: input.password, username: input.username, invite: input.inviteCode, consent: true }); this.token = String(result.token); return this.getCurrentUser(); }
  async getCurrentUser() { return user(await this.request<Raw>('/users/@me')); }
  async listSpaces() { return (await this.request<Raw[]>('/users/@me/guilds')).map(space); }
  async listChannels(spaceId: string) { return (await this.request<Raw[]>(`/guilds/${encodeURIComponent(spaceId)}/channels`)).map(channel); }
  async listMembers(spaceId: string) { return this.request<Raw[]>(`/guilds/${encodeURIComponent(spaceId)}/members?limit=100&after=0`); }
  async blockUser(userId: string) { await this.request(`/users/@me/relationships/${encodeURIComponent(userId)}`, 'PUT', { type: 2 }); }
  async unblockUser(userId: string) { await this.request(`/users/@me/relationships/${encodeURIComponent(userId)}`, 'DELETE'); }
  async removeMember(spaceId: string, userId: string) { await this.request(`/guilds/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`, 'DELETE'); }
  async ackRead(channelId: string, messageId: string) { await this.request(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/ack`, 'POST', { token: null }); }
  async getChannel(channelId: string) { return this.request<Raw>(`/channels/${encodeURIComponent(channelId)}`); }
  async getMember(spaceId: string, userId: string) { return this.request<Raw>(`/guilds/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`); }
  async listRoles(spaceId: string) { return this.request<Raw[]>(`/guilds/${encodeURIComponent(spaceId)}/roles`); }
  async listDMs() { return (await this.request<Raw[]>('/users/@me/channels')).map(channel); }
  async createDM(recipientId: string) { return channel(await this.request<Raw>('/users/@me/channels', 'POST', { recipients: [recipientId] })); }
  async listMessages(channelId: string, before?: string) { return (await this.request<Raw[]>(`/channels/${encodeURIComponent(channelId)}/messages?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`)).map(message).reverse(); }
  async sendMessage(channelId: string, content: string) { return message(await this.request<Raw>(`/channels/${encodeURIComponent(channelId)}/messages`, 'POST', { content, nonce: crypto.randomUUID() })); }
  async editMessage(channelId: string, messageId: string, content: string) { return message(await this.request<Raw>(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, 'PATCH', { content })); }
  async deleteMessage(channelId: string, messageId: string) { await this.request(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, 'DELETE'); }
  async createInvite(channelId: string) { return invite(await this.request<Raw>(`/channels/${encodeURIComponent(channelId)}/invites`, 'POST', { max_age: 86400, max_uses: 1, unique: true })); }
  async inspectInvite(code: string) { return invite(await this.request<Raw>(`/invites/${encodeURIComponent(code)}`)); }
  async acceptInvite(code: string) { return invite(await this.request<Raw>(`/invites/${encodeURIComponent(code)}`, 'POST')); }
  async updatePresence(status: 'online' | 'idle' | 'dnd' | 'invisible') { this.send({ op: 3, d: { since: null, activities: [], status, afk: status === 'idle' } }); }
  private send(payload: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload)); }
  async connect(): Promise<void> { if (!this.token) throw new SpacebarError(401, 'SIGN_IN_REQUIRED'); this.stopped = false; this.setStatus('connecting'); await this.openSocket(); }
  private async openSocket(): Promise<void> {
    if (this.stopped) return;
    let gateway: Raw;
    try { gateway = await this.request<Raw>('/gateway'); } catch { this.scheduleReconnect(); return; }
    if (this.stopped) return;
    const endpoint = new URL(String(gateway.url));
    const expected = new URL(this.instanceUrl);
    if (endpoint.host !== expected.host || !['ws:', 'wss:'].includes(endpoint.protocol) || (expected.protocol === 'https:' && endpoint.protocol !== 'wss:')) { this.setStatus('error'); throw new SpacebarError(403, 'UNTRUSTED_GATEWAY'); }
    endpoint.search = 'v=9&encoding=json';
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      let packet: Raw; try { packet = JSON.parse(String(event.data)); } catch { socket.close(); return; }
      if (typeof packet.s === 'number') this.sequence = packet.s;
      if (packet.op === 10) {
        this.clearHeartbeat(); this.ack = true;
        const interval = Number(packet.d?.heartbeat_interval);
        if (!Number.isFinite(interval) || interval < 1000) { socket.close(); return; }
        this.heartbeat = setInterval(() => { if (!this.ack) { socket.close(); return; } this.ack = false; this.send({ op: 1, d: this.sequence }); }, interval);
        if (this.sessionId) this.send({ op: 6, d: { token: this.token, session_id: this.sessionId, seq: this.sequence } });
        else this.send({ op: 2, d: { token: this.token, capabilities: 0, properties: { os: 'ROOMS Desktop', browser: 'ROOMS', device: 'desktop' }, compress: false, large_threshold: 50, presence: { status: 'online', activities: [], afk: false, since: null } } });
      } else if (packet.op === 11) this.ack = true;
      else if (packet.op === 1) this.send({ op: 1, d: this.sequence });
      else if (packet.op === 7) socket.close();
      else if (packet.op === 9) { this.sessionId = null; this.sequence = null; socket.close(); }
      else if (packet.op === 0) {
        if (packet.t === 'READY') { this.sessionId = packet.d.session_id; this.attempt = 0; this.setStatus('connected'); this.emit('READY', { user: user(packet.d.user), spaces: (packet.d.guilds ?? []).map(space) }); }
        else if (packet.t === 'RESUMED') { this.attempt = 0; this.setStatus('connected'); this.emit('RESUMED', null); }
        else if (packet.t === 'MESSAGE_CREATE' || packet.t === 'MESSAGE_UPDATE') this.emit(packet.t, message(packet.d));
        else if (['MESSAGE_DELETE', 'MESSAGE_ACK', 'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'GUILD_CREATE', 'GUILD_UPDATE', 'GUILD_DELETE', 'GUILD_MEMBER_ADD', 'GUILD_MEMBER_UPDATE', 'GUILD_MEMBER_REMOVE', 'PRESENCE_UPDATE', 'RELATIONSHIP_ADD', 'RELATIONSHIP_UPDATE', 'RELATIONSHIP_REMOVE', 'TYPING_START'].includes(String(packet.t))) this.emit(String(packet.t), packet.d);
      }
    });
    socket.addEventListener('close', (event) => { this.clearHeartbeat(); if (event.code === 4004) { this.stopped = true; this.setStatus('error'); this.emit('AUTH_EXPIRED', null); } else this.scheduleReconnect(); });
    socket.addEventListener('error', () => { socket.close(); });
  }
  private clearHeartbeat() { if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null; }
  private scheduleReconnect() { if (this.stopped || this.retry) return; this.setStatus('reconnecting'); const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)); this.retry = setTimeout(() => { this.retry = null; void this.openSocket().catch(() => this.scheduleReconnect()); }, delay); }
  async disconnect(): Promise<void> { this.stopped = true; if (this.retry) clearTimeout(this.retry); this.retry = null; this.clearHeartbeat(); this.socket?.close(1000); this.socket = null; this.sessionId = null; this.sequence = null; this.setStatus('not-configured'); }
  async logout(): Promise<void> { await this.disconnect(); this.token = null; }
}
export type SpacebarAdapter = SpacebarClient;
