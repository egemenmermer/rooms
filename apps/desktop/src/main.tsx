import { tr } from './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';
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
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><QueryClientProvider client={client}><HashRouter><App /></HashRouter></QueryClientProvider></Boundary></React.StrictMode>);
