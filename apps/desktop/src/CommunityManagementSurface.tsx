import { queryClient } from './query-client';
import { CommunityRoles } from './CommunityRoles';
import { CommunityInvitesTab } from './CommunityInvitesTab';
import { CommunitySignupRequestsTab } from './CommunitySignupRequestsTab';
import './reference-community-management.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  LockKeyhole,
  Ban,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Avatar, Modal } from '@rooms/design';
import type {
  SocialCommunityManagement,
  SocialCommunityRoleChange,
  SocialCommunityRoleResult,
  SocialManagedMember,
  SocialMemberRemoval,
  SocialMemberRoleChange,
  SocialUser,
} from '@rooms/social';
import { useCommunity } from './community';
import { locale, t, uiError } from './i18n';
import { VoiceAvatar } from './VoiceAvatar';

export interface CommunityManagementBridge {
  communityManagement(spaceId: string): Promise<SocialCommunityManagement>;
  changeCommunityRole(change: SocialCommunityRoleChange): Promise<SocialCommunityRoleResult>;
  setMemberRoles(change: SocialMemberRoleChange): Promise<SocialCommunityManagement>;
  removeCommunityMember(change: SocialMemberRemoval): Promise<SocialCommunityManagement>;
  banCommunityMember?(change: SocialMemberRemoval): Promise<SocialCommunityManagement>;
  /** Root maps content-free gateway/session invalidation; never passes secrets or raw invitations. */
  subscribeInvalidation?(listener: () => void): () => void;
}
export interface CommunityManagementFixture {
  snapshot: SocialCommunityManagement;
  tab?: 'members' | 'roles' | 'invites';
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
  return (
    <ManagementScope
      key={`${user?.id ?? ''}:${activeSpaceId ?? ''}:${serverUrl}`}
      {...props}
      userId={user?.id ?? null}
      spaceId={activeSpaceId}
      connected={status === 'connected'}
    />
  );
}
function ManagementScope({
  bridge: suppliedBridge,
  fixture,
  userId,
  spaceId,
  connected,
  onBack,
  onChannelPermissions,
  onCreateInvite,
}: CommunityManagementSurfaceProps & {
  userId: string | null;
  spaceId: string | null;
  connected: boolean;
}) {
  const community = useCommunity();
  const bridge = suppliedBridge ?? window.rooms?.social;
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const fixtureMode = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const [snapshot, setSnapshot] = useState<SocialCommunityManagement | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const [tab, setTab] = useState<'members' | 'roles' | 'invites' | 'signups'>('members'),
    [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{
      kind: 'role' | 'remove' | 'ban';
      userId: string;
    } | null>(null),
    [menu, setMenu] = useState<string | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const generation = useRef(0),
    alive = useRef(true),
    lock = useRef(false);
  const scope = `${userId}:${spaceId}:${community.serverUrl}`;
  const currentScope = () => {
    const state = useCommunity.getState();
    return (
      alive.current &&
      connected &&
      state.status === 'connected' &&
      `${state.user?.id ?? null}:${state.activeSpaceId}:${state.serverUrl}` === scope
    );
  };
  const accept = (value: SocialCommunityManagement, epoch: number) => {
    if (!currentScope() || epoch !== generation.current || value.spaceId !== spaceId) return false;
    queryClient.setQueryData(['community-management', scope], value);
    setSnapshot(value);
    return true;
  };
  const reload = useCallback(async () => {
    const epoch = ++generation.current;
    setDialog(null);
    setMenu(null);
    setRoleIds([]);
    setError('');
    setLoading(!snapshotRef.current);
    setRefreshing(true);
    // Explicit development projections never query a native account, even if no fixture was supplied.
    if (fixtureMode) {
      if (fixture?.snapshot.spaceId === spaceId && import.meta.env.DEV) {
        setSnapshot(fixture.snapshot);
        setTab(fixture.tab ?? 'members');
        const target = fixture.snapshot.members.find(
          (member) => member.user.id === fixture.memberId,
        );
        if (fixture.dialog && target) {
          setDialog({ kind: fixture.dialog, userId: target.user.id });
          setRoleIds([...target.roles]);
        }
      } else setError(t('Yerel örnek için topluluk yönetimi görünümü sağlanmadı.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!connected || !userId || !spaceId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!bridgeRef.current?.communityManagement) {
      setError(t('Topluluk yönetimi için masaüstü bağlantısı gerekli.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const key = ['community-management', scope];
      const cached = queryClient.getQueryData<SocialCommunityManagement>(key);
      if (cached && currentScope()) {
        setSnapshot(cached);
        setLoading(false);
      }
      const value = await queryClient.fetchQuery({
        queryKey: key,
        staleTime: 30000,
        queryFn: () =>
          new Promise<SocialCommunityManagement>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(t('Üyeler getirilemedi. Yeniden dene.'))),
              15000,
            );
            bridgeRef
              .current!.communityManagement(spaceId)
              .then(resolve, reject)
              .finally(() => clearTimeout(timer));
          }),
      });
      accept(value, epoch);
    } catch (failure) {
      if (currentScope() && epoch === generation.current) setError(uiError(failure));
    } finally {
      if (alive.current && epoch === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [scope, fixtureMode, fixture, connected]);
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (fixtureMode) return;
    const revoke = () => {
      queryClient.removeQueries({ queryKey: ['community-management', scope] });
      generation.current++;
      if (lock.current) return;
      setDialog(null);
      setMenu(null);
      setRoleIds([]);
      void reload();
    };
    const invalidate = () => {
      void queryClient
        .invalidateQueries({ queryKey: ['community-management', scope] })
        .then(() => reload());
    };
    const unsubscribe = suppliedBridge?.subscribeInvalidation?.(invalidate);
    window.addEventListener('rooms:channel-access-invalidated', revoke);
    return () => {
      unsubscribe?.();
      window.removeEventListener('rooms:channel-access-invalidated', revoke);
    };
  }, [suppliedBridge, reload, fixtureMode]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.rcm-member-action'))
        setMenu(null);
    };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', outside);
    };
  }, [menu]);
  const target = snapshot?.members.find((member) => member.user.id === dialog?.userId);
  const allowed = snapshot?.access === 'allowed',
    busy = loading || refreshing || working;
  const fixtureReason = t('Yerel görsel örnekte gerçek hesap işlemleri kapalı');
  const mutationReason = fixtureMode
    ? fixtureReason
    : !connected
      ? t('Topluluk bağlantısı bekleniyor')
      : !allowed
        ? t('Yönetim yetkisi gerekli')
        : '';
  const canAssign = !!target?.canAssignRoles && !!snapshot?.capabilities.assignRoles;
  const canRemove =
    !!target?.canRemove && !!snapshot?.capabilities.kickMembers && target.user.id !== userId;
  const canBan =
    !!target?.canBan &&
    !!snapshot?.capabilities.banMembers &&
    target.user.id !== userId &&
    !!bridgeRef.current?.banCommunityMember;
  const roleNames = (member: SocialManagedMember) =>
    member.roles.map(
      (id) => snapshot?.roles.find((role) => role.id === id)?.name ?? t('Tanımlı rol'),
    );
  const space = community.spaces.find((item) => item.id === spaceId),
    name = space?.name ?? t('Topluluk');
  const ownerId = space?.ownerId;
  const changeRoles = (member: SocialManagedMember) => {
    setMenu(null);
    setError('');
    setRoleIds([...member.roles]);
    setDialog({ kind: 'role', userId: member.user.id });
  };
  const changed =
    !!target && JSON.stringify([...target.roles].sort()) !== JSON.stringify([...roleIds].sort());
  async function mutate(kind: 'role' | 'remove' | 'ban') {
    if (
      fixtureMode ||
      mutationReason ||
      busy ||
      lock.current ||
      !target ||
      !spaceId ||
      !currentScope()
    )
      return;
    if (kind === 'role' ? !canAssign || !changed : kind === 'ban' ? !canBan : !canRemove) return;
    const current = bridgeRef.current;
    if (!current) {
      setError(t('Masaüstü bağlantısı gerekli.'));
      return;
    }
    // Existing roles unavailable for assignment remain intact unless a permitted own edit removes them.
    if (
      kind === 'role' &&
      roleIds.some(
        (id) =>
          !target.roles.includes(id) &&
          !snapshot?.roles.some((role) => role.id === id && role.assignable),
      )
    ) {
      setError(t('Seçilen rollerden biri atanamıyor. Görünümü yenile.'));
      return;
    }
    const epoch = generation.current;
    lock.current = true;
    setWorking(true);
    setError('');
    try {
      const value =
        kind === 'role'
          ? await current.setMemberRoles({ spaceId, userId: target.user.id, roleIds: [...roleIds] })
          : kind === 'ban'
            ? await current.banCommunityMember!({ spaceId, userId: target.user.id })
            : await current.removeCommunityMember({ spaceId, userId: target.user.id });
      if (accept(value, epoch)) {
        setDialog(null);
        setRoleIds([]);
      }
    } catch (failure) {
      if (currentScope() && epoch === generation.current) setError(uiError(failure));
    } finally {
      lock.current = false;
      if (alive.current) setWorking(false);
    }
  }
  async function changeCommunityRole(change: SocialCommunityRoleChange) {
    if (mutationReason || busy || lock.current || !currentScope() || change.spaceId !== spaceId)
      throw new Error(mutationReason || t('İşlem sürüyor. Biraz bekleyip yeniden dene.'));
    const current = bridgeRef.current;
    if (!current?.changeCommunityRole)
      throw new Error(t('Rol düzenleme için uygulamayı güncelle.'));
    lock.current = true;
    setWorking(true);
    try {
      const result = await current.changeCommunityRole(change);
      if (!currentScope()) throw new Error(t('Topluluk bağlantısı değişti. Rolleri yeniden aç.'));
      // A successful mutation is followed by an authoritative native read. Fence older reads,
      // including our own gateway echo, without discarding the editor's unsaved other tab.
      accept(result.management, ++generation.current);
      setRefreshing(false);
      return result;
    } catch (failure) {
      if (currentScope()) {
        queryClient.removeQueries({ queryKey: ['community-management', scope] });
        void reload();
      }
      throw failure;
    } finally {
      lock.current = false;
      if (alive.current) setWorking(false);
    }
  }
  const statusName = (member: SocialManagedMember) =>
    member.statusText ||
    (
      {
        online: t('Çevrimiçi'),
        idle: t('Uzakta'),
        dnd: t('Rahatsız etmeyin'),
        invisible: t('Çevrimdışı'),
        unknown: t('Durum bilinmiyor'),
      } as const
    )[member.status];
  const members =
    snapshot?.members.filter((member) =>
      `${member.user.displayName} ${member.user.username}`
        .toLocaleLowerCase(locale)
        .includes(query.toLocaleLowerCase(locale)),
    ) ?? [];
  const footer = (
    <div className="rcm-state-actions">
      {onBack && (
        <button className="button primary" onClick={onBack}>
          {t('Sohbete dön')}
        </button>
      )}
      <button className="button secondary" disabled={busy} onClick={() => void reload()}>
        <RefreshCw size={15} />
        {t('Yenile')}
      </button>
    </div>
  );
  if (!userId || !spaceId || !connected)
    return (
      <section className="rcm-state">
        <LockKeyhole size={62} />
        <h1>
          {!userId
            ? t('Topluluğa bağlan')
            : !spaceId
              ? t('Bir topluluk seç')
              : t('Bağlantı bekleniyor')}
        </h1>
        <p>{t('Üye yönetimi için etkin topluluk bağlantısı gerekli.')}</p>
        {footer}
      </section>
    );
  if (loading)
    return (
      <section className="rcm-state" aria-busy="true">
        <Users size={46} />
        <h1>{t('Üyeler ve roller getiriliyor')}</h1>
      </section>
    );
  if (!snapshot)
    return (
      <section className="rcm-state">
        <ShieldCheck size={58} />
        <h1>{t('Yönetim görünümü alınamadı')}</h1>
        <p role="alert">{error || t('Masaüstü bağlantısını yenile.')}</p>
        {footer}
      </section>
    );
  if (!allowed)
    return (
      <section className="rcm-state">
        <div className="rcm-denied-icon">
          <Users size={72} />
          <LockKeyhole size={24} />
        </div>
        <h1>
          {snapshot.access === 'missing' ? t('Topluluğa erişilemiyor') : t('Yönetim yetkin yok')}
        </h1>
        <p>
          {t(
            'Üyeler, roller ve davetler yalnızca yetkili kişilere açıktır. Bu alana erişmek için topluluk sahibine başvur.',
          )}
        </p>
        {footer}
      </section>
    );
  return (
    <section className="rcm-page">
      <header className="rcm-heading">
        <div>
          <span>{t('TOPLULUK YÖNETİMİ')}</span>
          <h1>{name}</h1>
          <p>{t('Üyeler ve roller.')}</p>
        </div>
        <div>
          <button
            className="button primary"
            disabled={fixtureMode || !onCreateInvite}
            title={
              fixtureMode
                ? fixtureReason
                : !onCreateInvite
                  ? t('Hesap daveti oluşturma akışı bu görünümde bağlı değil')
                  : undefined
            }
            onClick={onCreateInvite}
          >
            <Plus size={17} />
            {t('Davet oluştur')}
          </button>
          <button
            className="rcm-refresh"
            aria-label={t('Üyeleri yenile')}
            disabled={busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      {fixtureMode && (
        <p className="rcm-demo">{t('DEMO · Yerel yönetim görünümü · Hesap işlemleri kapalı')}</p>
      )}
      <div className="rcm-tabs" role="tablist" aria-label={t('Topluluk yönetimi')}>
        <button
          role="tab"
          aria-selected={tab === 'members'}
          onClick={() => {
            setTab('members');
            setMenu(null);
          }}
        >
          {t('Üyeler · {count}', { count: snapshot.members.length })}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'roles'}
          onClick={() => {
            setTab('roles');
            setMenu(null);
          }}
        >
          {t('Roller · {count}', { count: snapshot.roles.length })}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'invites'}
          onClick={() => {
            setTab('invites');
            setMenu(null);
          }}
        >
          {t('Davetler')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'signups'}
          onClick={() => {
            setTab('signups');
            setMenu(null);
          }}
        >
          Kayıt istekleri
        </button>
      </div>
      {tab === 'signups' ? (
        <CommunitySignupRequestsTab
          spaceId={snapshot.spaceId}
          capability={snapshot.invites}
          bridge={fixtureMode ? null : community}
          disabledReason={
            fixtureMode
              ? fixtureReason
              : !connected
                ? 'Topluluk bağlantısı bekleniyor. Bağlantı gelince yeniden dene.'
                : undefined
          }
        />
      ) : tab === 'roles' ? (
        <CommunityRoles
          snapshot={snapshot}
          busy={busy}
          disabledReason={mutationReason}
          mutate={changeCommunityRole}
        />
      ) : tab === 'invites' ? (
        <CommunityInvitesTab
          spaceId={snapshot.spaceId}
          capability={snapshot.invites}
          members={snapshot.members}
          bridge={fixtureMode ? null : community}
          disabledReason={
            fixtureMode
              ? fixtureReason
              : !connected
                ? t('Topluluk bağlantısı bekleniyor. Bağlantı gelince yeniden dene.')
                : undefined
          }
          onCreateInvite={onCreateInvite}
        />
      ) : (
        <>
          <div className="rcm-search-row">
            <label className="rcm-search">
              <Search size={16} />
              <input
                aria-label={t('Üye ara')}
                placeholder={t('Üye ara')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <small>
              {t('{members} üye · {online} çevrimiçi', {
                members: snapshot.members.length,
                online: snapshot.members.filter((member) => member.status === 'online').length,
              })}
            </small>
          </div>
          <div className="rcm-table-wrap">
            <table className="rcm-members">
              <thead>
                <tr>
                  <th>{t('ÜYE')}</th>
                  <th>{t('ROL')}</th>
                  <th>{t('DURUM')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isOwner = member.user.id === ownerId,
                    assign = member.canAssignRoles && snapshot.capabilities.assignRoles,
                    remove =
                      member.canRemove &&
                      snapshot.capabilities.kickMembers &&
                      member.user.id !== userId,
                    ban =
                      !!member.canBan &&
                      !!snapshot.capabilities.banMembers &&
                      member.user.id !== userId &&
                      !!bridge?.banCommunityMember;
                  return (
                    <tr key={member.user.id}>
                      <td>
                        <div className="rcm-person">
                          <MemberAvatar user={member.user} status={member.status} />
                          <div>
                            <strong>{member.user.displayName}</strong>
                            {member.user.id === userId && <small>{t('sen')}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="rcm-role-badges">
                          {isOwner ? (
                            <span className="owner">{t('Topluluk sahibi')}</span>
                          ) : member.roles.length ? (
                            member.roles.map((id) => {
                              const role = snapshot.roles.find((item) => item.id === id);
                              return (
                                <span key={id}>
                                  <i
                                    aria-hidden="true"
                                    style={{
                                      backgroundColor: role?.color ?? '#9b8afb',
                                      width: 7,
                                      height: 7,
                                      borderRadius: '50%',
                                      display: 'inline-block',
                                      marginRight: 6,
                                      alignSelf: 'center',
                                    }}
                                  />
                                  {role?.name ?? t('Tanımlı rol')}
                                </span>
                              );
                            })
                          ) : (
                            <span>{t('Üye')}</span>
                          )}
                        </div>
                      </td>
                      <td>{statusName(member)}</td>
                      <td className="rcm-member-action">
                        {isOwner ? (
                          <small>{t('Sahip')}</small>
                        ) : (
                          <>
                            <button
                              disabled={(!assign && !remove && !ban) || busy}
                              title={
                                !assign && !remove
                                  ? t('Yetki veya rol hiyerarşisi bu üyeyi yönetmeye izin vermiyor')
                                  : undefined
                              }
                              aria-expanded={menu === member.user.id}
                              onClick={() =>
                                setMenu((value) =>
                                  value === member.user.id ? null : member.user.id,
                                )
                              }
                            >
                              <MoreHorizontal size={17} />
                              {assign ? t('Rolü düzenle') : t('Yönet')}
                            </button>
                            {menu === member.user.id && (
                              <div className="rcm-menu">
                                <button
                                  disabled={!assign || busy}
                                  title={
                                    !assign
                                      ? t('Bu üyenin rolünü değiştirme yetkin yok')
                                      : undefined
                                  }
                                  onClick={() => changeRoles(member)}
                                >
                                  <ShieldCheck size={14} />
                                  {t('Rolü düzenle')}
                                </button>
                                <button
                                  className="danger"
                                  disabled={!remove || busy}
                                  title={!remove ? t('Bu üyeyi çıkarma yetkin yok') : undefined}
                                  onClick={() => {
                                    setMenu(null);
                                    setError('');
                                    setDialog({ kind: 'remove', userId: member.user.id });
                                  }}
                                >
                                  <LogOut size={14} />
                                  {t('Topluluktan çıkar')}
                                </button>
                                {ban && (
                                  <button
                                    className="danger"
                                    disabled={busy}
                                    onClick={() => {
                                      setMenu(null);
                                      setError('');
                                      setDialog({ kind: 'ban', userId: member.user.id });
                                    }}
                                  >
                                    <Ban size={14} />
                                    {t('Yasakla')}
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!members.length && (
            <p className="rcm-no-members">
              {query ? t('Aramana uyan üye yok.') : t('Üye görünümü boş.')}
            </p>
          )}
          <section className="rcm-role-summary">
            <header>
              <h2>{t('Roller')}</h2>
              <button onClick={() => setTab('roles')}>
                {t('Rolleri düzenle')} <ArrowRight size={17} />
              </button>
              <button
                disabled={!onChannelPermissions}
                title={
                  !onChannelPermissions ? t('Önce izinlerini yöneteceğin kanalı seç') : undefined
                }
                onClick={onChannelPermissions}
              >
                <ArrowRight size={17} />
                {t('Kanal izinlerini aç')}
              </button>
            </header>
            <div>
              {snapshot.roles.map((role) => (
                <article key={role.id}>
                  <strong>{role.name}</strong>
                  <p>
                    {t('{count} üye · {state}', {
                      count: snapshot.members.filter((member) => member.roles.includes(role.id))
                        .length,
                      state: role.assignable ? t('Atanabilir') : t('Atama kapalı'),
                    })}
                  </p>
                </article>
              ))}
            </div>
            {!snapshot.roles.length && <p>{t('Tanımlı rol yok.')}</p>}
          </section>
        </>
      )}
      {error && (
        <p className="rcm-error" role="alert">
          {error}
        </p>
      )}
      {dialog && target && (
        <Modal
          title={
            dialog.kind === 'role'
              ? t('{displayName} adlı üyenin rolünü değiştir', {
                  displayName: target.user.displayName,
                })
              : dialog.kind === 'ban'
                ? t('{displayName} adlı üyeyi yasakla?', { displayName: target.user.displayName })
                : t('{displayName} adlı üyeyi çıkar?', { displayName: target.user.displayName })
          }
          className="rcm-modal"
          onClose={() => {
            if (!working) {
              setDialog(null);
              setError('');
            }
          }}
        >
          <div className="rcm-modal-body">
            <div className="rcm-person">
              <MemberAvatar user={target.user} status={target.status} />
              <div>
                <strong>{target.user.displayName}</strong>
                {dialog.kind === 'role' && (
                  <small>
                    {t('Mevcut rol: {roles}', { roles: roleNames(target).join(', ') || t('Üye') })}
                  </small>
                )}
              </div>
            </div>
            {dialog.kind === 'role' ? (
              <>
                <fieldset disabled={working || !canAssign}>
                  <legend>{t('Roller')}</legend>
                  {snapshot.roles.map((role) => {
                    const original = target.roles.includes(role.id),
                      editable = role.assignable || (original && target.user.id === userId);
                    return (
                      <label
                        key={role.id}
                        title={
                          !editable
                            ? t('Bu rolü atama veya kaldırma izni bu görünümde yok')
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={roleIds.includes(role.id)}
                          disabled={!editable}
                          onChange={(event) =>
                            setRoleIds((values) =>
                              event.target.checked
                                ? [...values.filter((id) => id !== role.id), role.id]
                                : values.filter((id) => id !== role.id),
                            )
                          }
                        />
                        <span>{role.name}</span>
                        {!editable && <LockKeyhole size={12} />}
                      </label>
                    );
                  })}
                  {!snapshot.roles.length && <p>{t('Henüz rol oluşturulmamış.')}</p>}
                  {!snapshot.roles.length && snapshot.capabilities.manageRoles && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setDialog(null);
                        setTab('roles');
                      }}
                    >
                      {t('Rolleri aç')}
                    </button>
                  )}
                </fieldset>
                <p className="rcm-note">
                  {t(
                    'Seçtiğin roller bu üyeye rolün izinlerini verir. Yetkileri Roller sekmesinden düzenleyebilirsin.',
                  )}
                </p>
                <p className="rcm-note">
                  {t(
                    'Kanal bazında verilmiş ek izinleri Kanal izinleri bölümünden yönetebilirsin.',
                  )}
                </p>
              </>
            ) : (
              <p className="rcm-removal">
                {t('{user}, {name} topluluğundaki kanal ve odalara erişemeyecek.', {
                  user: target.user.displayName,
                  name,
                })}
                {dialog.kind === 'ban' &&
                  ` ${t('Yasak kaldırılana kadar davetle de geri dönemez.')}`}
              </p>
            )}
            {mutationReason && <p className="rcm-note">{mutationReason}</p>}
            {error && (
              <p className="rcm-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button
              className="button secondary"
              disabled={working}
              onClick={() => {
                setDialog(null);
                setError('');
              }}
            >
              {t('Vazgeç')}
            </button>
            <button
              className={`button ${dialog.kind === 'role' ? 'primary' : 'danger'}`}
              disabled={
                busy ||
                !!mutationReason ||
                (dialog.kind === 'role'
                  ? !canAssign || !changed
                  : dialog.kind === 'ban'
                    ? !canBan
                    : !canRemove)
              }
              title={mutationReason || undefined}
              onClick={() => void mutate(dialog.kind)}
            >
              {dialog.kind === 'role' ? (
                <Check size={16} />
              ) : dialog.kind === 'ban' ? (
                <Ban size={16} />
              ) : (
                <LogOut size={16} />
              )}{' '}
              {working
                ? t('Bekleniyor…')
                : dialog.kind === 'role'
                  ? t('Rolü değiştir')
                  : dialog.kind === 'ban'
                    ? t('Yasakla')
                    : t('Topluluktan çıkar')}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}

function MemberAvatar({
  user,
  status,
}: {
  user: SocialUser;
  status: SocialManagedMember['status'];
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatar]);
  let source: string | null = null;
  try {
    const url = new URL(user.avatar ?? '');
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      source = url.href;
  } catch {
    /* An absent or unsupported avatar uses the shared initials fallback. */
  }
  return (
    <span className={`rcm-avatar status-${status}`}>
      {source && !failed ? (
        <img src={source} alt="" onError={() => setFailed(true)} />
      ) : (
        <VoiceAvatar id={user.id} name={user.displayName} />
      )}
      <i aria-hidden="true" />
    </span>
  );
}

export { CommunityManagementSurface };
