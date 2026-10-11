import { tr } from './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import './reference-tokens.css';
import App from './App';
import './reference-shell.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30000 } } });
class Boundary extends React.Component<{
    children: React.ReactNode;
}, {
    failed: boolean;
}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { if (this.state.failed)
        return <div className="fatal"><h1>{tr("Let\u2019s get you back in.")}</h1><p>{tr("The local view could not open. Your settings are still saved.")}</p><button className="button primary" onClick={() => location.reload()}>{tr("Reload ROOMS")}</button></div>; return this.props.children; }
}
async function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const fixture = import.meta.env.DEV ? params.get('fixture') : null;
    if (fixture) {
        const { installReferenceFixture } = await import('./dev/reference-fixtures');
        if(/^S5[678]$/.test(fixture)){
          const task=await import('./dev/agent-task-fixture');task.getAgentTaskFixture(fixture,params.get('variant')||'default');
          await installReferenceFixture('S19','default');
        }else if(/^S1[2-8]$/.test(fixture)){
          await installReferenceFixture('S19','default');
          const detail=await import('./dev/social-detail-fixture');
          const state=detail.getSocialDetailFixture(fixture,params.get('variant')||'default');
          const {useCommunity}=await import('./community');
          useCommunity.setState(state.publicState);
        }else if(fixture==='S68'){
          const management=await import('./dev/community-management-fixture');
          management.getCommunityManagementFixture(params.get('variant')||'default');
          await installReferenceFixture('S19','default');
        }else if(fixture==='S29'){
          await installReferenceFixture('S19','default');
          const player=await import('./dev/personal-playback-fixture');player.installPersonalPlaybackFixture(params.get('variant')||'default');
        }else if(/^S2[4-8]$/.test(fixture)){
          await installReferenceFixture('S19','default');
          const cinema=await import('./dev/cinema-fixture');
          cinema.cinemaFixtureVariant(fixture,params.get('variant')||'default');
          cinema.installCinemaFixture(fixture,params.get('variant')||'default');
        }else if(fixture==='S30'){
          await installReferenceFixture('S19','default');
          const mini=await import('./dev/mini-playback-fixture');
          mini.installMiniPlaybackFixture(params.get('variant')||'default');
        }else if(/^S3[3-9]$/.test(fixture)){
          await installReferenceFixture('S19','default');
          const personal=await import('./dev/personal-media-fixture');personal.installPersonalMediaFixture(fixture,params.get('variant')||'default');
          if(fixture==='S36'||fixture==='S39'||fixture==='S38'&&params.get('variant')==='playing'){const player=await import('./dev/personal-playback-fixture');player.installInsetPlaybackFixture(fixture,params.get('variant')||'default');}
        }else if(fixture==='S66'){
          await installReferenceFixture('S19','default');
          const appearance=await import('./dev/appearance-fixture');appearance.installAppearanceFixture(params.get('variant')||'default');
        }else if(/^S(59|60|61|62|63)$/.test(fixture)){
          await installReferenceFixture('S19','default');
        }else if(/^S(4[0-9]|5[0-4])$/.test(fixture)){
          const games=await import('./dev/games-fixture');
          games.getGamesFixtureMetadata(fixture,params.get('variant')||'default');
          await installReferenceFixture('S19','default');
          games.installGamesFixture(fixture,params.get('variant')||'default',{initialActivityStatusIntegrated:true,initialUIIntegrated:true});
        }else await installReferenceFixture(fixture, params.get('variant') || 'default');
        const { installMediaFixture } = await import('./dev/media-fixture');
        if(/^S5[678]$/.test(fixture)||fixture==='S68'||fixture==='S70'||fixture==='S71')installMediaFixture('S10','default');
        if (fixture === 'S29') installMediaFixture('S19','default');
        if (fixture === 'S30' && ['personal','live'].includes(params.get('variant') || 'default')) installMediaFixture('S19','default');
        if (fixture==='S66'||/^S(59|60|61|62|63)$/.test(fixture)) installMediaFixture('S10','default');
        if (/^S3[3-9]$/.test(fixture)) installMediaFixture('S10','default');
        if (['S10','S19','S20','S21','S22','S23'].includes(fixture)) installMediaFixture(fixture, params.get('variant') || 'default');
        document.documentElement.dataset.referenceFixture = `${fixture}/${params.get('variant') || 'default'}`;
        console.info('ROOMS development fixture: local example data; no service integration certification.');
    }
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><QueryClientProvider client={client}><HashRouter><App /></HashRouter></QueryClientProvider></Boundary></React.StrictMode>);

}
void bootstrap();
