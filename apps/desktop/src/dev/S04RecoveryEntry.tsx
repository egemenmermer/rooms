import { useState } from 'react';
import { ConnectionPane } from '../ConnectionPane';
import { PasswordResetPane, type PasswordResetBridge } from '../PasswordResetPane';
import { PasswordRecoveryPane, ReferenceAuthFrame } from '../ReferenceOnboarding';

const fixtureServer = 'https://recovery.example.test';
const requestBridge = {
  passwordRecoveryCapabilities: async () => ({ emailEnabled: true, captcha: { required: false, siteKey: null } }),
  requestPasswordRecovery: async () => ({ accepted: true as const }),
};
const resetBridge: PasswordResetBridge = {
  importPasswordRecoveryLink: async () => ({ handle: 'df5694c9-d74d-4eee-b390-e248fe92e18a', expiresAt: Date.now() + 180000, serverOrigin: fixtureServer }),
  confirmPasswordRecovery: async () => { throw new Error('DEV fixture: native account changes are unavailable.'); },
  cancelPasswordRecovery: async () => {},
};

/** Explicit DEV-only component runtime. No clipboard, IPC, server or account operations occur here. */
export default function S04RecoveryEntry({ variant }: { variant: string }) {
  if (!import.meta.env.DEV) throw new Error('Recovery fixtures are unavailable in production.');
  if (!['default', 'sent', 'reset', 'expired'].includes(variant)) throw new Error('Unsupported S04 recovery fixture.');
  const [view, setView] = useState<'request' | 'reset' | 'signin'>(variant === 'expired' ? 'signin' : variant === 'reset' ? 'reset' : 'request');
  return <ReferenceAuthFrame mode={view === 'signin' ? 'signin' : 'recovery'}>
    <div className="demo-indicator" style={{position:'fixed',top:8,right:16,zIndex:20}} title="Local component fixture; no recovery email or account mutation.">DEMO · Yerel örnek</div>
    {view === 'signin' ? <ConnectionPane referenceMode="signin" sessionExpired={variant === 'expired'} onRecovery={() => setView('request')}/> : <section className="ref-auth-form">
      {view === 'reset' ? <PasswordResetPane serverUrl={fixtureServer} scopeKey="DEV-S04-only" bridge={resetBridge} onBack={() => setView('signin')} onNewRequest={() => setView('request')}/>
        : <PasswordRecoveryPane serverUrl={fixtureServer} bridge={requestBridge} onBack={() => setView('signin')} onReset={() => setView('reset')}/>}
    </section>}
  </ReferenceAuthFrame>;
}
