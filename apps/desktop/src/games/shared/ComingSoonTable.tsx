import { Hourglass } from 'lucide-react';
import { t } from '../../i18n';
import type { GameCatalogEntry } from '../catalog';
import { ScoreHistory, scoreHistoryResult } from '../card-history/CardHistory';
import type { GameDefinition } from '../registry';

/**
 * Stands in for a game whose table view has not shipped yet: the server can already run it (another
 * client may open one), so seats, history and "close table" keep working around this notice.
 */
export function ComingSoonTable() {
  return (
    <section className="rx-watch" role="status">
      <Hourglass size={32} />
      <h2>{t('Bu oyunun masası yakında')}</h2>
      <p>{t('Masa açık ve sunucuda oynanıyor; bu sürüm henüz gösteremiyor.')}</p>
    </section>
  );
}

/** Registry entry for a game without a client view; its track replaces it with the real one. */
export const comingSoonGame = (catalog: GameCatalogEntry): GameDefinition => ({
  catalog,
  Table: ComingSoonTable,
  ruleRows: () => [[t('Oyun'), catalog.name]],
  HistoryDetail: ScoreHistory,
  historyResult: scoreHistoryResult,
});
