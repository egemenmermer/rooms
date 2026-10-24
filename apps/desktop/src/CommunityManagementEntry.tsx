import { useEffect, useMemo, useState } from 'react';
import CommunityManagementSurface, {
  type CommunityManagementFixture,
} from './CommunityManagementSurface';
import { t, uiError } from './i18n';

export function CommunityManagementEntry({
  onBack,
  onChannelPermissions,
  onCreateInvite,
}: {
  onBack(): void;
  onChannelPermissions(): void;
  onCreateInvite?(): void;
}) {
  const [fixture, setFixture] = useState<CommunityManagementFixture | undefined>(),
    [error, setError] = useState('');
  const bridge = useMemo(
    () =>
      window.rooms?.social
        ? {
            ...window.rooms.social,
            subscribeInvalidation: (listener: () => void) => {
              window.addEventListener('rooms:community-management-invalidated', listener);
              return () =>
                window.removeEventListener('rooms:community-management-invalidated', listener);
            },
          }
        : undefined,
    [],
  );
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('fixture') === 'S68';
  useEffect(() => {
    let active = true;
    if (demo)
      void import('./dev/community-management-fixture')
        .then((module) => {
          const value = module.getCommunityManagementFixture(
            new URLSearchParams(location.search).get('variant') || 'default',
          );
          if (active) setFixture(value);
        })
        .catch((failure) => {
          if (active) setError(uiError(failure));
        });
    return () => {
      active = false;
    };
  }, [demo]);
  if (demo && !fixture)
    return (
      <div className="community-fixture-state" role={error ? 'alert' : 'status'}>
        {error || t('Yerel görünüm hazırlanıyor…')}
      </div>
    );
  return (
    <CommunityManagementSurface
      bridge={bridge}
      fixture={fixture}
      onCreateInvite={onCreateInvite}
      onBack={onBack}
      onChannelPermissions={onChannelPermissions}
    />
  );
}
