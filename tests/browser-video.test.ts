import { describe, expect, it } from 'vitest';
import { findBrowserWindow, parseWatchPage } from '../apps/desktop/electron/browser-video';

describe('browser-only YouTube videos', () => {
  it('reads public watch page facts without trusting markup', () => {
    const html = `<html><meta name="title" content="Kolpaçino | Türk Komedi Filmi &amp; Full Film">
      <script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK","playableInEmbed":false},
      "videoDetails":{"videoId":"vqgWJXO7UwM","title":"ignored","lengthSeconds":"5836",
      "ownerChannelName":"Fanatik Film \\u0026 Dizi"}};</script>`;
    expect(parseWatchPage(html)).toEqual({
      status: 'OK',
      embeddable: false,
      title: 'Kolpaçino | Türk Komedi Filmi & Full Film',
      author: 'Fanatik Film & Dizi',
      durationSec: 5836,
    });
    expect(parseWatchPage('{"playabilityStatus":{"status":"ERROR"}}')).toMatchObject({
      status: 'ERROR',
      title: '',
      durationSec: null,
    });
  });
  it('finds the browser window showing the video by its page title', () => {
    const sources = [
      { id: 'screen:1:0', name: 'Kolpaçino | Türk Komedi Filmi - YouTube' },
      { id: 'window:7:0', name: 'Notlar' },
      { id: 'window:9:0', name: 'KOLPAÇİNO | türk komedi filmi | Full Film İzle (HD)' },
      {
        id: 'window:8:0',
        name: '(3) Kolpaçino | Türk Komedi Filmi | Full Film İzle (HD) - YouTube',
      },
    ];
    expect(
      findBrowserWindow(sources, 'Kolpaçino | Türk Komedi Filmi | Full Film İzle (HD)')?.id,
    ).toBe('window:8:0');
    expect(findBrowserWindow(sources, 'Başka video')).toBeNull();
    expect(findBrowserWindow(sources, 'Kol')).toBeNull();
  });
});
