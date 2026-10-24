import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@rooms/design';
import {
  SOCIAL_ROLE_PERMISSION_KEYS,
  type SocialCommunityManagement,
  type SocialCommunityRole,
  type SocialCommunityRoleChange,
  type SocialCommunityRoleResult,
  type SocialRolePermissionKey,
  type SocialRolePermissionValues,
} from '@rooms/social';
import { t, uiError } from './i18n';
import './community-roles.css';

const permissions: {
  key: SocialRolePermissionKey;
  title: string;
  detail: string;
  group: string;
}[] = [
  {
    key: 'view',
    title: t('Kanalları gör'),
    detail: t('Topluluktaki sohbet ve odaları görür.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'send',
    title: t('Mesaj gönder'),
    detail: t('Sohbet kanallarına yazabilir.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'files',
    title: t('Fotoğraf ve dosya gönder'),
    detail: t('Sohbetlere dosya ekleyebilir.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'connect',
    title: t('Ses odasına katıl'),
    detail: t('Ses odalarına girebilir.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'speak',
    title: t('Mikrofon kullan'),
    detail: t('Ses odalarında konuşabilir.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'video',
    title: t('Kamera ve ekran paylaş'),
    detail: t('Odada görüntü yayınlayabilir.'),
    group: t('Birlikte takılma'),
  },
  {
    key: 'manageMessages',
    title: t('Mesajları yönet'),
    detail: t('Diğer üyelerin mesajlarını silebilir.'),
    group: t('Düzeni sağlama'),
  },
  {
    key: 'kickMembers',
    title: t('Üyeleri çıkar'),
    detail: t('Kendisinden alt roldeki üyeleri topluluktan çıkarabilir.'),
    group: t('Düzeni sağlama'),
  },
  {
    key: 'banMembers',
    title: t('Üyeleri yasakla'),
    detail: t('Kendisinden alt roldeki üyeleri çıkarıp geri dönmelerini engelleyebilir.'),
    group: t('Düzeni sağlama'),
  },
  {
    key: 'moveMembers',
    title: t('Odalar arasında taşı'),
    detail: t('Ses odasındaki birini başka odaya taşıyabilir ya da sesten çıkarabilir.'),
    group: t('Düzeni sağlama'),
  },
  {
    key: 'manageChannels',
    title: t('Sohbet ve odaları yönet'),
    detail: t('Kanal oluşturabilir, düzenleyebilir ve silebilir.'),
    group: t('Yönetim'),
  },
  {
    key: 'assignRoles',
    title: t('Üyelere rol ver'),
    detail: t('Kendi rolünden altındaki rolleri atayabilir.'),
    group: t('Yönetim'),
  },
  {
    key: 'manageRoles',
    title: t('Rolleri düzenle'),
    detail: t('Alt roller oluşturabilir, adını ve rengini değiştirebilir, silebilir.'),
    group: t('Yönetim'),
  },
  {
    key: 'managePermissions',
    title: t('Yetkileri düzenle'),
    detail: t('Alt rollere ve kanallara kendi sahip olduğu yetkileri verebilir.'),
    group: t('Yönetim'),
  },
];
const colors = ['#9b8afb', '#57ba9c', '#62a9e6', '#e8aa63', '#e482a7', '#bcc4d6'];
const presets = [
  {
    name: t('Kanka'),
    color: colors[0],
    description: t('Sohbet ve ses odaları'),
    allow: ['view', 'send', 'files', 'connect', 'speak', 'video'],
  },
  {
    name: t('Yayıncı'),
    color: colors[1],
    description: t('Kamera ve ekran paylaşımı'),
    allow: ['view', 'connect', 'speak', 'video'],
  },
  {
    name: t('Moderatör'),
    color: colors[3],
    description: t('Mesaj ve üye düzeni'),
    allow: ['manageMessages', 'kickMembers', 'moveMembers'],
  },
] satisfies {
  name: string;
  color: string;
  description: string;
  allow: SocialRolePermissionKey[];
}[];
export const inheritedRolePermissions = () =>
  Object.fromEntries(
    SOCIAL_ROLE_PERMISSION_KEYS.map((key) => [key, 'inherit']),
  ) as SocialRolePermissionValues;

export interface CommunityRolesProps {
  snapshot: SocialCommunityManagement;
  busy: boolean;
  disabledReason?: string;
  mutate(change: SocialCommunityRoleChange): Promise<SocialCommunityRoleResult>;
}
export function CommunityRoles({ snapshot, busy, disabledReason, mutate }: CommunityRolesProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<SocialCommunityRole | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const role = snapshot.roles.find((item) => item.id === selected);
  const blocked = !!disabledReason || busy;
  async function create() {
    if (blocked || !snapshot.capabilities.manageRoles || !name.trim()) return;
    setError('');
    try {
      const result = await mutate({
        action: 'create',
        spaceId: snapshot.spaceId,
        name: name.trim(),
      });
      if (!alive.current) return;
      setCreating(false);
      setSelected(result.roleId);
      setNotice(t('Rol oluşturuldu. Rengini ve yetkilerini seçebilirsin.'));
    } catch (failure) {
      if (alive.current) setError(uiError(failure));
    }
  }
  async function remove() {
    if (blocked || !deleting?.editable) return;
    setError('');
    try {
      await mutate({ action: 'delete', spaceId: snapshot.spaceId, roleId: deleting.id });
      if (!alive.current) return;
      setDeleting(null);
      setSelected(null);
      setNotice(t('Rol silindi.'));
    } catch (failure) {
      if (alive.current) setError(uiError(failure));
    }
  }
  return (
    <div className="community-roles">
      {role ? (
        <RoleEditor
          key={role.id}
          role={role}
          {...{ snapshot, busy, disabledReason, mutate }}
          onBack={() => {
            setSelected(null);
            setNotice('');
          }}
        />
      ) : (
        <>
          <div className="roles-heading">
            <div>
              <h2>{t('Bizim roller')}</h2>
              <p>{t('İsmini koy, rengini seç, kim ne yapabilir belirle.')}</p>
            </div>
            <button
              className="button primary"
              disabled={blocked || !snapshot.capabilities.manageRoles}
              title={
                disabledReason ||
                (!snapshot.capabilities.manageRoles ? t('Rol oluşturma yetkin yok') : undefined)
              }
              onClick={() => {
                setName('');
                setError('');
                setCreating(true);
              }}
            >
              <Plus size={16} /> {t('Rol oluştur')}
            </button>
          </div>
          <div className="roles-list">
            {snapshot.roles.map((item) => (
              <div key={item.id} className="roles-row">
                <button
                  className="roles-open"
                  onClick={() => {
                    setSelected(item.id);
                    setNotice('');
                  }}
                  disabled={busy}
                >
                  <i style={{ backgroundColor: item.color ?? '#9b8afb' }} />
                  <strong>{item.name}</strong>
                  <span>
                    {t('{count} üye', {
                      count: snapshot.members.filter((member) => member.roles.includes(item.id))
                        .length,
                    })}
                  </span>
                  <Pencil size={15} />
                </button>
                <button
                  className="roles-delete"
                  aria-label={t('{name} rolünü sil', { name: item.name })}
                  disabled={blocked || !item.editable}
                  title={
                    disabledReason ||
                    (!item.editable ? t('Bu rolü silme yetkin yok') : t('Rolü sil'))
                  }
                  onClick={() => {
                    setError('');
                    setDeleting(item);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          {!snapshot.roles.length && (
            <p className="roles-empty">{t('Henüz rol yok. İlk rolüne “Kanka” diyebilirsin.')}</p>
          )}
          <p className="roles-help">
            {t(
              'Rolü oluşturduktan sonra Üyeler sekmesinden arkadaşlarına verebilirsin. Bir kişiye birden fazla rol verilebilir.',
            )}
          </p>
        </>
      )}
      {notice && (
        <p className="roles-notice" role="status">
          {notice}
        </p>
      )}
      {disabledReason && <p className="roles-help">{disabledReason}</p>}
      {error && !creating && !deleting && (
        <p className="rcm-error" role="alert">
          {error}
        </p>
      )}
      {creating && (
        <Modal
          title={t('Yeni rol')}
          className="roles-modal"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="roles-name">
              {t('Rol adı')}
              <input
                autoFocus
                value={name}
                maxLength={32}
                placeholder={t('Mesela: Gece tayfası')}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="roles-name-suggestions">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={busy}
                  onClick={() => setName(preset.name)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <p className="roles-help">
              {t(
                'Yeni rol topluluğun varsayılan yetkileriyle başlar. Sonraki ekranda değiştirebilirsin.',
              )}
            </p>
            {error && (
              <p className="rcm-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                {t('Vazgeç')}
              </button>
              <button className="button primary" disabled={blocked || !name.trim()}>
                {busy ? t('Oluşturuluyor…') : t('Rolü oluştur')}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={t('Rol silinsin mi?')}
          className="roles-modal"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            {t('{name} rolü ve bu rolün verdiği yetkiler üyelerden kaldırılacak.', {
              name: deleting.name,
            })}
          </p>
          {error && (
            <p className="rcm-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>
              {t('Vazgeç')}
            </button>
            <button className="button danger" disabled={blocked} onClick={() => void remove()}>
              {busy ? t('Siliniyor…') : t('Rolü sil')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  snapshot,
  busy,
  disabledReason,
  mutate,
  onBack,
}: CommunityRolesProps & { role: SocialCommunityRole; onBack(): void }) {
  const [tab, setTab] = useState<'appearance' | 'permissions'>('appearance');
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [values, setValues] = useState({ ...role.permissions });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const appearanceDirty = name.trim() !== role.name || color !== role.color;
  const permissionsDirty = SOCIAL_ROLE_PERMISSION_KEYS.some(
    (key) => values[key] !== role.permissions[key],
  );
  const dirty = appearanceDirty || permissionsDirty;
  const editable = tab === 'appearance' ? role.editable : role.permissionsEditable;
  const blocked = busy || !!disabledReason || !editable;
  async function save() {
    if (blocked || (tab === 'appearance' && !name.trim())) return;
    setError('');
    setSaved(false);
    try {
      const result = await mutate(
        tab === 'appearance'
          ? {
              action: 'appearance',
              spaceId: snapshot.spaceId,
              roleId: role.id,
              name: name.trim(),
              color,
            }
          : { action: 'permissions', spaceId: snapshot.spaceId, roleId: role.id, values },
      );
      if (!alive.current) return;
      const updated = result.management.roles.find((item) => item.id === role.id);
      if (!updated) {
        setError(t('Rol artık bulunamıyor. Rol listesine dön.'));
        return;
      }
      if (tab === 'appearance') {
        setName(updated.name);
        setColor(updated.color);
      } else setValues({ ...updated.permissions });
      setSaved(true);
    } catch (failure) {
      if (alive.current) setError(uiError(failure));
    }
  }
  return (
    <div className="role-editor">
      <button
        className="roles-back"
        disabled={busy}
        onClick={() => (dirty ? setLeaving(true) : onBack())}
      >
        <ArrowLeft size={16} /> {t('Rollere dön')}
      </button>
      <div className="roles-heading">
        <h2>
          <i style={{ backgroundColor: color ?? '#9b8afb' }} />
          {name || t('Yeni rol')}
        </h2>
        <span>
          {t('{count} üye', {
            count: snapshot.members.filter((member) => member.roles.includes(role.id)).length,
          })}
        </span>
      </div>
      <div className="rcm-tabs" role="tablist" aria-label={t('Rol düzenleme')}>
        <button
          role="tab"
          aria-selected={tab === 'appearance'}
          onClick={() => {
            setTab('appearance');
            setSaved(false);
          }}
        >
          {t('İsim ve renk')}
          {appearanceDirty ? ' ·' : ''}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'permissions'}
          onClick={() => {
            setTab('permissions');
            setSaved(false);
          }}
        >
          {t('Yetkiler')}
          {permissionsDirty ? ' ·' : ''}
        </button>
      </div>
      <fieldset disabled={blocked} className="role-fields">
        {tab === 'appearance' ? (
          <>
            <label className="roles-name">
              {t('Rol adı')}
              <input
                aria-label={t('Rol adı')}
                value={name}
                maxLength={32}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <span className="roles-label">{t('Renk')}</span>
            <div className="roles-colors">
              <button
                type="button"
                aria-pressed={color === null}
                onClick={() => {
                  setColor(null);
                  setSaved(false);
                }}
              >
                {t('Varsayılan')}
              </button>
              {colors.map((value) => (
                <button
                  type="button"
                  key={value}
                  className="roles-swatch"
                  style={{ backgroundColor: value }}
                  aria-label={t('{value} renk', { value })}
                  aria-pressed={color === value}
                  onClick={() => {
                    setColor(value);
                    setSaved(false);
                  }}
                >
                  {color === value && <Check size={17} />}
                </button>
              ))}
              <label className="roles-custom-color">
                {t('Özel renk')}
                <input
                  type="color"
                  aria-label={t('Özel rol rengi')}
                  value={color ?? '#9b8afb'}
                  onChange={(event) => {
                    setColor(event.target.value);
                    setSaved(false);
                  }}
                />
              </label>
            </div>
            <div className="roles-preview">
              <span style={{ borderColor: color ?? '#9b8afb' }}>
                <i style={{ backgroundColor: color ?? '#9b8afb' }} />
                {name || t('Rol adı')}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="roles-help">
              {t(
                '“Varsayılan” topluluğun mevcut ayarını kullanır. İzin ver veya engelle seçerek bu role özel değiştirebilirsin. Diğer roller ve kanal izinleri de sonucu etkileyebilir.',
              )}
            </p>
            <div className="roles-presets">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setValues(
                      (current) =>
                        Object.fromEntries(
                          SOCIAL_ROLE_PERMISSION_KEYS.map((key) => [
                            key,
                            snapshot.grantablePermissions.includes(key)
                              ? preset.allow.some((allowed) => allowed === key)
                                ? 'allow'
                                : 'inherit'
                              : current[key],
                          ]),
                        ) as SocialRolePermissionValues,
                    );
                    setSaved(false);
                  }}
                >
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
            {[t('Birlikte takılma'), t('Düzeni sağlama'), t('Yönetim')].map((group) => (
              <section key={group} className="role-permission-group">
                <h3>{group}</h3>
                {permissions
                  .filter((item) => item.group === group)
                  .map((permission) => (
                    <label key={permission.key} className="role-permission-row">
                      <span>
                        <strong>{permission.title}</strong>
                        <small>{permission.detail}</small>
                      </span>
                      <select
                        aria-label={permission.title}
                        value={values[permission.key]}
                        disabled={!snapshot.grantablePermissions.includes(permission.key)}
                        title={
                          !snapshot.grantablePermissions.includes(permission.key)
                            ? t('Sahip olmadığın bir yetkiyi değiştiremezsin')
                            : undefined
                        }
                        onChange={(event) => {
                          setValues((current) => ({
                            ...current,
                            [permission.key]: event.target.value,
                          }));
                          setSaved(false);
                        }}
                      >
                        <option value="inherit">{t('Varsayılan')}</option>
                        <option value="allow">{t('İzin ver')}</option>
                        <option value="deny">{t('Engelle')}</option>
                      </select>
                    </label>
                  ))}
              </section>
            ))}
          </>
        )}
      </fieldset>
      {!editable && (
        <p className="roles-help">
          {tab === 'appearance'
            ? t('Bu rolün ismini ve rengini değiştirme yetkin yok.')
            : t('Bu rolün yetkilerini değiştirme yetkin yok.')}
        </p>
      )}
      {error && (
        <p className="rcm-error" role="alert">
          {error}
        </p>
      )}
      <footer className="role-save-bar">
        <span role="status">
          {saved
            ? t('Kaydedildi')
            : (tab === 'appearance' ? appearanceDirty : permissionsDirty)
              ? t('Kaydedilmemiş değişiklikler')
              : ''}
        </span>
        <button
          className="button primary"
          disabled={
            blocked || (tab === 'appearance' ? !appearanceDirty || !name.trim() : !permissionsDirty)
          }
          onClick={() => void save()}
        >
          {busy ? t('Kaydediliyor…') : t('Kaydet')}
        </button>
      </footer>
      {leaving && (
        <Modal
          title={t('Değişikliklerden vazgeçilsin mi?')}
          className="roles-modal"
          onClose={() => setLeaving(false)}
        >
          <p>{t('Kaydetmediğin isim, renk veya yetki değişiklikleri kaybolacak.')}</p>
          <footer>
            <button className="button secondary" onClick={() => setLeaving(false)}>
              {t('Düzenlemeye devam et')}
            </button>
            <button className="button primary" onClick={onBack}>
              {t('Vazgeç ve dön')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
