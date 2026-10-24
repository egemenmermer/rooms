import { useEffect, useState } from 'react';
import type { GamesFixtureMetadata } from '../../dev/games-fixture';

export function useGameFixtureMetadata() {
  const [metadata, setMetadata] = useState<GamesFixtureMetadata | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(location.search),
      id = params.get('fixture');
    if (!id || !/^S(4\d|5[0-4])$/.test(id)) return;
    let alive = true;
    void import('../../dev/games-fixture').then((module) => {
      const value = module.getGamesFixtureMetadata(id, params.get('variant') || 'default');
      if (alive) setMetadata(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return metadata;
}
