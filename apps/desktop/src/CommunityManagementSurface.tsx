import './reference-community-management.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Link2, LockKeyhole, LogOut, MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { Avatar, Modal } from '@rooms/design';
import type { SocialCommunityManagement, SocialManagedMember, SocialMemberRemoval, SocialMemberRoleChange, SocialUser } from '@rooms/social';
import { useCommunity } from './community';
import { uiError } from './i18n';
import {VoiceAvatar} from './VoiceAvatar';

export interface CommunityManagementBridge {
  communityManagement(spaceId: string): Promise<SocialCommunityManagement>;
  setMemberRoles(change: SocialMemberRoleChange): Promise<SocialCommunityManagement>;
  removeCommunityMember(change: SocialMemberRemoval): Promise<SocialCommunityManagement>;
  /** Root maps content-free gateway/session invalidation; never passes secrets or raw invitations. */
  subscribeInvalidation?(listener: () => void): () => void;
}
export interface CommunityManagementFixture {
  snapshot: SocialCommunityManagement;
  tab?: 'members' | 'invites';
  dialog?: 'role' | 'remove';
  memberId?: string;
}
export interface CommunityManagementSurfaceProps {
  bridge?: CommunityManagementBridge;
  onBack?(): void;
  onChannelPermissions?(): void;
  /** Opens the existing broker invitation flow. It does not imply list/revoke support here. */
  onCreateInvite?(): void;
  fixture?: CommunityManagementFixture;
}

/** Scope keys synchronously remove the previous account/space roster, before effects run. */
export default function CommunityManagementSurface(props: CommunityManagementSurfaceProps) {
  const { user, activeSpaceId, serverUrl, status } = useCommunity();
  return <ManagementScope key={`${user?.id ?? ''}:${activeSpaceId ?? ''}:${serverUrl}:${status}`}
    {...props} userId={user?.id ?? null} spaceId={activeSpaceId} connected={status === 'connected'}/>;
}
function ManagementScope({ bridge: suppliedBridge, fixture, userId, spaceId, connected, onBack, onChannelPermissions, onCreateInvite }: CommunityManagementSurfaceProps & {
  userId: string | null; spaceId: string | null; connected: boolean;
}) {
  const community = useCommunity();
  const bridge = suppliedBridge ?? window.rooms?.social;
  const bridgeRef = useRef(bridge); bridgeRef.current = bridge;
  const fixtureMode = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const [snapshot, setSnapshot] = useState<SocialCommunityManagement | null>(null);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState<'members' | 'invites'>('members'), [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ kind: 'role' | 'remove'; userId: string } | null>(null), [menu, setMenu] = useState<string | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const generation = useRef(0), alive = useRef(true), lock = useRef(false);
  const scope = `${userId}:${spaceId}:${community.serverUrl}`;
  const currentScope = () => {
    const state = useCommunity.getState();
    return alive.current && connected && state.status === 'connected' && `${state.user?.id ?? null}:${state.activeSpaceId}:${state.serverUrl}` === scope;
  };
  const accept = (value: SocialCommunityManagement, epoch: number) => {
    if (!currentScope() || epoch !== generation.current || value.spaceId !== spaceId) return false;
    setSnapshot(value); return true;
  };
  const reload = useCallback(async () => {
    const epoch = ++generation.current;
    setSnapshot(null); setDialog(null); setMenu(null); setRoleIds([]); setError(''); setLoading(true);
    // Explicit development projections never query a native account, even if no fixture was supplied.
    if (fixtureMode) {
      if (fixture?.snapshot.spaceId === spaceId && import.meta.env.DEV) {
        setSnapshot(fixture.snapshot); setTab(fixture.tab ?? 'members');
        const target = fixture.snapshot.members.find(member => member.user.id === fixture.memberId);
        if (fixture.dialog && target) { setDialog({ kind: fixture.dialog, userId: target.user.id }); setRoleIds([...target.roles]); }
      } else setError('Yerel örnek için topluluk yönetimi görünümü sağlanmadı.');
      setLoading(false); return;
    }
    if (!connected || !userId || !spaceId) { setLoading(false); return; }
    if (!bridgeRef.current?.communityManagement) { setError('Topluluk yönetimi için masaüstü bağlantısı gerekli.'); setLoading(false); return; }
    try { accept(await bridgeRef.current.communityManagement(spaceId), epoch); }
    catch (failure) { if (currentScope() && epoch === generation.current) setError(uiError(failure)); }
    finally { if (alive.current && epoch === generation.current) setLoading(false); }
  }, [scope, fixtureMode, fixture, connected]);
  useEffect(() => {
    alive.current = true; void reload();
    return () => { alive.current = false; generation.current++; };
  }, [reload]);
  useEffect(() => {
    if (fixtureMode) return;
    const invalidate = () => { generation.current++; setSnapshot(null); setDialog(null); setMenu(null); setRoleIds([]); void reload(); };
    const unsubscribe = suppliedBridge?.subscribeInvalidation?.(invalidate);
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    return () => { unsubscribe?.(); window.removeEventListener('rooms:channel-access-invalidated', invalidate); };
  }, [suppliedBridge, reload, fixtureMode]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.rcm-member-action')) setMenu(null); };
    window.addEventListener('keydown', dismiss); window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', dismiss); window.removeEventListener('pointerdown', outside); };
  }, [menu]);
  const target = snapshot?.members.find(member => member.user.id === dialog?.userId);
  const allowed = snapshot?.access === 'allowed', busy = loading || working;
  const fixtureReason = 'Yerel görsel örnekte gerçek hesap işlemleri kapalı';
  const mutationReason = fixtureMode ? fixtureReason : !connected ? 'Topluluk bağlantısı bekleniyor' : !allowed ? 'Yönetim yetkisi gerekli' : '';
  const canAssign = !!target?.canAssignRoles && !!snapshot?.capabilities.assignRoles;
  const canRemove = !!target?.canRemove && !!snapshot?.capabilities.kickMembers && target.user.id !== userId;
  const roleNames = (member: SocialManagedMember) => member.roles.map(id => snapshot?.roles.find(role => role.id === id)?.name ?? 'Tanımlı rol');
  const space = community.spaces.find(item => item.id === spaceId), name = space?.name ?? 'Topluluk';
  const ownerId = space?.ownerId;
  const changeRoles = (member: SocialManagedMember) => { setMenu(null); setError(''); setRoleIds([...member.roles]); setDialog({ kind: 'role', userId: member.user.id }); };
  const changed = !!target && JSON.stringify([...target.roles].sort()) !== JSON.stringify([...roleIds].sort());
  async function mutate(kind: 'role' | 'remove') {
    if (fixtureMode || mutationReason || busy || lock.current || !target || !spaceId || !currentScope()) return;
    if (kind === 'role' ? !canAssign || !changed : !canRemove) return;
    const current = bridgeRef.current;
    if (!current) { setError('Masaüstü bağlantısı gerekli.'); return; }
    // Existing roles unavailable for assignment remain intact unless a permitted own edit removes them.
    if (kind === 'role' && roleIds.some(id => !target.roles.includes(id) && !snapshot?.roles.some(role => role.id === id && role.assignable))) {
      setError('Seçilen rollerden biri atanamıyor. Görünümü yenile.'); return;
    }
    const epoch = generation.current; lock.current = true; setWorking(true); setError('');
    try {
      const value = kind === 'role'
        ? await current.setMemberRoles({ spaceId, userId: target.user.id, roleIds: [...roleIds] })
        : await current.removeCommunityMember({ spaceId, userId: target.user.id });
      if (accept(value, epoch)) { setDialog(null); setRoleIds([]); }
    } catch (failure) { if (currentScope() && epoch === generation.current) setError(uiError(failure)); }
    finally { lock.current = false; if (alive.current) setWorking(false); }
  }
  const statusName = (member: SocialManagedMember) => member.statusText || ({ online: 'Çevrimiçi', idle: 'Uzakta', dnd: 'Rahatsız etmeyin', invisible: 'Çevrimdışı', unknown: 'Durum bilinmiyor' } as const)[member.status];
  const members = snapshot?.members.filter(member => `${member.user.displayName} ${member.user.username}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))) ?? [];
  const footer = <div className="rcm-state-actions">{onBack && <button className="button primary" onClick={onBack}>Sohbete dön</button>}<button className="button secondary" disabled={busy} onClick={() => void reload()}><RefreshCw size={15}/>Yenile</button></div>;
  if (!userId || !spaceId || !connected) return <section className="rcm-state"><LockKeyhole size={62}/><h1>{!userId ? 'Topluluğa bağlan' : !spaceId ? 'Bir topluluk seç' : 'Bağlantı bekleniyor'}</h1><p>Üye yönetimi için etkin topluluk bağlantısı gerekli.</p>{footer}</section>;
  if (loading) return <section className="rcm-state" aria-busy="true"><Users size={46}/><h1>Üyeler ve roller getiriliyor</h1></section>;
  if (!snapshot) return <section className="rcm-state"><ShieldCheck size={58}/><h1>Yönetim görünümü alınamadı</h1><p role="alert">{error || 'Masaüstü bağlantısını yenile.'}</p>{footer}</section>;
  if (!allowed) return <section className="rcm-state"><div className="rcm-denied-icon"><Users size={72}/><LockKeyhole size={24}/></div><h1>{snapshot.access === 'missing' ? 'Topluluğa erişilemiyor' : 'Yönetim yetkin yok'}</h1><p>Üyeler, roller ve davetler yalnızca yetkili kişilere açıktır. Bu alana erişmek için topluluk sahibine başvur.</p>{footer}</section>;
  return <section className="rcm-page"><header className="rcm-heading"><div><span>TOPLULUK YÖNETİMİ</span><h1>{name}</h1><p>Üyeler ve roller.</p></div><div><button className="button primary" disabled={fixtureMode || !onCreateInvite} title={fixtureMode ? fixtureReason : !onCreateInvite ? 'Hesap daveti oluşturma akışı bu görünümde bağlı değil' : undefined} onClick={onCreateInvite}><Plus size={17}/>Davet oluştur</button><button className="rcm-refresh" aria-label="Üyeleri yenile" disabled={busy} onClick={() => void reload()}><RefreshCw size={16}/></button></div></header>
    {fixtureMode && <p className="rcm-demo">DEMO · Yerel yönetim görünümü · Hesap işlemleri kapalı</p>}
    <div className="rcm-tabs" role="tablist" aria-label="Topluluk yönetimi"><button role="tab" aria-selected={tab === 'members'} onClick={() => { setTab('members'); setMenu(null); }}>Üyeler · {snapshot.members.length}</button><button role="tab" aria-selected={tab === 'invites'} onClick={() => { setTab('invites'); setMenu(null); }}>Davetler</button></div>
    {tab === 'invites' ? <div className="rcm-invites"><h2>Aktif davetler</h2><div className="rcm-unavailable"><Link2 size={24}/><div><strong>Davet yönetimi henüz uygulanmadı</strong><p>{snapshot.invites.reason}</p></div></div><div className="rcm-invite-actions"><button className="button secondary" disabled title="ROOMS davet aracısında yetkili davet listeleme ve iptal etme yöntemi henüz yok">Daveti iptal et</button>{onCreateInvite && <button className="button secondary" disabled={fixtureMode} title={fixtureMode ? fixtureReason : undefined} onClick={onCreateInvite}>Yeni hesap daveti oluştur</button>}</div></div> : <><div className="rcm-search-row"><label className="rcm-search"><Search size={16}/><input aria-label="Üye ara" placeholder="Üye ara" value={query} onChange={event => setQuery(event.target.value)}/></label><small>{snapshot.members.length} üye · {snapshot.members.filter(member => member.status === 'online').length} çevrimiçi</small></div><div className="rcm-table-wrap"><table className="rcm-members"><thead><tr><th>ÜYE</th><th>ROL</th><th>DURUM</th><th/></tr></thead><tbody>{members.map(member => { const isOwner = member.user.id === ownerId, assign = member.canAssignRoles && snapshot.capabilities.assignRoles, remove = member.canRemove && snapshot.capabilities.kickMembers && member.user.id !== userId; return <tr key={member.user.id}><td><div className="rcm-person"><MemberAvatar user={member.user} status={member.status}/><div><strong>{member.user.displayName}</strong>{member.user.id === userId && <small>sen</small>}</div></div></td><td><div className="rcm-role-badges">{isOwner ? <span className="owner">Topluluk sahibi</span> : member.roles.length ? roleNames(member).map((role,index) => <span key={index}>{role}</span>) : <span>Üye</span>}</div></td><td>{statusName(member)}</td><td className="rcm-member-action">{isOwner ? <small>Sahip</small> : <><button disabled={!assign && !remove || busy} title={!assign && !remove ? 'Yetki veya rol hiyerarşisi bu üyeyi yönetmeye izin vermiyor' : undefined} aria-expanded={menu === member.user.id} onClick={() => setMenu(value => value === member.user.id ? null : member.user.id)}><MoreHorizontal size={17}/>{assign ? 'Rolü düzenle' : 'Yönet'}</button>{menu === member.user.id && <div className="rcm-menu"><button disabled={!assign || busy} title={!assign ? 'Bu üyenin rolünü değiştirme yetkin yok' : undefined} onClick={() => changeRoles(member)}><ShieldCheck size={14}/>Rolü düzenle</button><button className="danger" disabled={!remove || busy} title={!remove ? 'Bu üyeyi çıkarma yetkin yok' : undefined} onClick={() => { setMenu(null); setError(''); setDialog({kind:'remove',userId:member.user.id}); }}><LogOut size={14}/>Topluluktan çıkar</button></div>}</>}</td></tr>; })}</tbody></table></div>{!members.length && <p className="rcm-no-members">{query ? 'Aramana uyan üye yok.' : 'Üye görünümü boş.'}</p>}<section className="rcm-role-summary"><header><h2>Rol özeti</h2><button disabled={!onChannelPermissions} title={!onChannelPermissions ? 'Önce izinlerini yöneteceğin kanalı seç' : undefined} onClick={onChannelPermissions}><ArrowRight size={17}/>Kanal izinlerini aç</button></header><div>{snapshot.roles.map(role => <article key={role.id}><strong>{role.name}</strong><p>{snapshot.members.filter(member => member.roles.includes(role.id)).length} üye · {role.assignable ? 'Atanabilir' : 'Atama kapalı'}</p></article>)}</div>{!snapshot.roles.length && <p>Tanımlı rol yok.</p>}</section></>}
    {error && <p className="rcm-error" role="alert">{error}</p>}
    {dialog && target && <Modal title={dialog.kind === 'role' ? `${target.user.displayName} adlı üyenin rolünü değiştir` : `${target.user.displayName} adlı üyeyi çıkar?`} className="rcm-modal" onClose={() => { if (!working) { setDialog(null); setError(''); } }}><div className="rcm-modal-body"><div className="rcm-person"><MemberAvatar user={target.user} status={target.status}/><div><strong>{target.user.displayName}</strong>{dialog.kind === 'role' && <small>Mevcut rol: {roleNames(target).join(', ') || 'Üye'}</small>}</div></div>{dialog.kind === 'role' ? <><fieldset disabled={working || !canAssign}><legend>Roller</legend>{snapshot.roles.map(role => { const original = target.roles.includes(role.id), editable = role.assignable || original && target.user.id === userId; return <label key={role.id} title={!editable ? 'Bu rolü atama veya kaldırma izni bu görünümde yok' : undefined}><input type="checkbox" checked={roleIds.includes(role.id)} disabled={!editable} onChange={event => setRoleIds(values => event.target.checked ? [...values.filter(id => id !== role.id),role.id] : values.filter(id => id !== role.id))}/><span>{role.name}</span>{!editable && <LockKeyhole size={12}/>}</label>; })}{!snapshot.roles.length && <p>Atanabilecek tanımlı rol yok.</p>}</fieldset><div className="rcm-impact"><strong>Erişim etkisi</strong><p>Rol değişikliği kanal ve yönetim erişimini değiştirebilir. Kesin erişim etkisi bu görünümde sunulmuyor.</p></div><p className="rcm-note">Kanal bazında verilmiş ek izinleri Kanal izinleri bölümünden yönetebilirsin.</p></> : <p className="rcm-removal">{target.user.displayName}, {name} topluluğundaki kanal ve odalara erişemeyecek.</p>}{mutationReason && <p className="rcm-note">{mutationReason}</p>}{error && <p className="rcm-error" role="alert">{error}</p>}</div><footer><button className="button secondary" disabled={working} onClick={() => { setDialog(null); setError(''); }}>Vazgeç</button><button className={`button ${dialog.kind === 'remove' ? 'danger' : 'primary'}`} disabled={busy || !!mutationReason || (dialog.kind === 'role' ? !canAssign || !changed : !canRemove)} title={mutationReason || undefined} onClick={() => void mutate(dialog.kind)}>{dialog.kind === 'role' ? <Check size={16}/> : <LogOut size={16}/>} {working ? 'Bekleniyor…' : dialog.kind === 'role' ? 'Rolü değiştir' : 'Topluluktan çıkar'}</button></footer></Modal>}
  </section>;
}

function MemberAvatar({ user, status }: { user: SocialUser; status: SocialManagedMember['status'] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatar]);
  let source: string | null = null;
  try { const url = new URL(user.avatar ?? ''); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) source = url.href; } catch { /* An absent or unsupported avatar uses the shared initials fallback. */ }
  return <span className={`rcm-avatar status-${status}`}>{source && !failed ? <img src={source} alt="" onError={() => setFailed(true)}/> : <VoiceAvatar id={user.id} name={user.displayName}/>}<i aria-hidden="true"/></span>;
}

export { CommunityManagementSurface };
