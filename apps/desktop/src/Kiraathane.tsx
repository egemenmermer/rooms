import './kiraathane.css';
import { History, MessageCircle, Plus, Users } from 'lucide-react';
import type { GamePublicState } from '../../../packages/activity-protocol/src';
type Kind = GamePublicState['kind'];
const tables: { label: string; kind?: Kind; x: number; y: number; unavailable?: string }[] = [
  { label: 'Sohbet', x: 25, y: 52 },
  { label: 'Batak', kind: 'batak', x: 42.5, y: 52 },
  { label: 'Tavla', x: 60, y: 52, unavailable: 'Tavla henüz desteklenmiyor' },
  { label: 'Blackjack', kind: 'blackjack', x: 24.5, y: 80 },
  { label: 'Satranç', x: 42.5, y: 80, unavailable: 'Satranç henüz desteklenmiyor' },
  { label: '101 Okey', kind: '101', x: 60, y: 80 },
  { label: 'Texas Hold’em', kind: 'holdem', x: 83, y: 80 },
];
export function tableCapacity(game: GamePublicState): number {
  const value = Number(game.view.rules?.capacity ?? game.view.capacity ?? (game.kind === 'blackjack' ? 7 : game.kind === 'holdem' ? 9 : 4));
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : 4;
}
export function Kiraathane({ game, ready, error, blocked, busy, onCreate, onOpen, onChat, onHistory, onRetry }: {
  game: GamePublicState | null; ready: boolean; error: string | null; blocked: string; busy: boolean;
  onCreate(kind: Kind): void; onOpen(): void; onChat(): void; onHistory(): void; onRetry(): void;
}) {
  return <section className="coffeehouse" aria-label="Kıraathane">
    <div className="coffeehouse-tools"><span>{!ready ? 'Masa durumu bekleniyor' : game ? 'Odanın masası açık' : 'Bir masa seç'}{blocked && ready && !game ? ` · ${blocked}` : ''}</span><button onClick={onHistory}><History size={16}/>Geçmiş</button></div>
    {error && <div className="coffeehouse-error" role="alert">{error}<button onClick={onRetry} disabled={busy}>Yeniden dene</button></div>}
    <div className="coffeehouse-scroll"><div className="coffeehouse-scene">
      <img className="coffeehouse-interior" src="./kiraathane/interior.jpg" alt="Ahşap masaları, çay ocağı ve sobası olan kıraathane"/>
      {tables.map((table, index) => {
        const active = !!table.kind && game?.kind === table.kind;
        const reason = table.unavailable ?? (table.kind ? !ready ? 'Masa bağlantısı bekleniyor' : active ? '' : blocked || (game ? 'Önce açık masayı bitirin' : '') : '');
        return <button key={table.label} className={`coffeehouse-table ${active ? 'active' : ''}`} style={{ left: `${table.x}%`, top: `${table.y}%` }} disabled={!!reason || busy && !!table.kind} title={reason || undefined} aria-description={reason || undefined} onClick={() => table.kind ? active ? onOpen() : onCreate(table.kind) : onChat()}>
          {active ? <span className="coffeehouse-count"><Users size={13}/>{game.seats.length}/{tableCapacity(game)}</span> : table.kind ? <span className="coffeehouse-count"><Plus size={13}/>{!ready ? 'Bekleniyor' : reason ? 'Kapalı' : 'Masa oluştur'}</span> : <span className="coffeehouse-count"><MessageCircle size={13}/>{table.unavailable ? 'Kapalı' : 'Sohbete dön'}</span>}
          <strong>Masa {index + 1}</strong><small>{table.label}{active ? game.status === 'waiting' ? ' · Oyuncu bekliyor' : game.status === 'finished' ? ' · El tamamlandı' : ' · Oynanıyor' : ''}</small>
        </button>;
      })}
    </div></div>
    <p className="coffeehouse-note">Oda başına tek oyun masası.</p>
  </section>;
}
