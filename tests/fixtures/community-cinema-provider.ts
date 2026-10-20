import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';

export const PROVIDER_USER = 'salonuser';
export const PROVIDER_PASSWORD = 'S3cretPass';

const xmltvTime = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00 +0000`;
};

/** A tiny Xtream Codes panel: two live channels, two movies, one series, an XMLTV guide. */
export async function startProvider(now: number) {
  const requests: string[] = [];
  const hour = 3600_000;
  const base = Math.floor(now / hour) * hour;
  const xmltv = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="TRT1.tr"><display-name>TRT 1</display-name></channel>
  <channel id="ShowTV.tr"><display-name>Show TV</display-name></channel>
  <programme channel="TRT1.tr" start="${xmltvTime(base)}" stop="${xmltvTime(base + hour)}"><title>Ana Haber</title><desc>Günün özeti &amp; hava durumu</desc></programme>
  <programme channel="TRT1.tr" start="${xmltvTime(base + hour)}" stop="${xmltvTime(base + 2 * hour)}"><title>Gönül Dağı</title></programme>
  <programme channel="ShowTV.tr" start="${xmltvTime(base)}" stop="${xmltvTime(base + 2 * hour)}"><title>Kızılcık Şerbeti</title></programme>
  <programme channel="Other.tr" start="${xmltvTime(base)}" stop="${xmltvTime(base + hour)}"><title>Ignored</title></programme>
</tv>`;
  const json = (body: unknown) => JSON.stringify(body);
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://provider');
    requests.push(url.pathname + url.search);
    const authorized =
      url.searchParams.get('username') === PROVIDER_USER &&
      url.searchParams.get('password') === PROVIDER_PASSWORD;
    if (url.pathname === '/player_api.php') {
      response.setHeader('content-type', 'application/json');
      if (!authorized) return response.end(json({ user_info: { auth: 0 } }));
      switch (url.searchParams.get('action')) {
        case null:
          return response.end(
            json({
              user_info: {
                auth: 1,
                status: 'Active',
                exp_date: String(Math.floor(now / 1000) + 86400 * 90),
                max_connections: '2',
                active_cons: '0',
              },
              server_info: {
                timestamp_now: Math.floor(now / 1000),
                time_now: new Date(now).toISOString().slice(0, 19).replace('T', ' '),
              },
            }),
          );
        case 'get_live_categories':
          return response.end(
            json([
              { category_id: '1', category_name: 'TR | Ulusal' },
              { category_id: '2', category_name: 'Spor' },
            ]),
          );
        case 'get_live_streams':
          return response.end(
            json([
              {
                stream_id: 1001,
                name: 'TR: TRT 1 HD',
                stream_icon: 'http://img.provider/trt1.png',
                epg_channel_id: 'TRT1.tr',
                category_id: '1',
                num: 1,
                added: '1700000000',
              },
              {
                stream_id: '1002',
                name: 'Show TV FHD',
                stream_icon: '',
                epg_channel_id: null,
                category_id: '1',
                num: '2',
              },
              { stream_id: 1003, name: 'Sıcak Spor 4K', category_id: '2' },
            ]),
          );
        case 'get_vod_categories':
          return response.end(
            json({ categories: [{ category_id: 7, category_name: 'Yerli Filmler' }] }),
          );
        case 'get_vod_streams':
          return response.end(
            json([
              {
                stream_id: 3001,
                name: 'Kış Uykusu (2014)',
                category_id: 7,
                rating: '8.1',
                added: '1710000000',
                container_extension: 'mkv',
                stream_icon: 'http://img.provider/kis.jpg',
                tmdb: '1001001',
              },
              {
                stream_id: 3002,
                name: 'Babam ve Oğlum',
                category_id: '7',
                rating_5based: 4.5,
                added: '1690000000',
                tmdb: '0',
              },
            ]),
          );
        case 'get_series_categories':
          return response.end(json([{ category_id: '9', category_name: 'Dizi' }]));
        case 'get_series':
          return response.end(
            json([
              {
                series_id: 5001,
                name: 'Sıcak Kafa',
                category_id: '9',
                cover: 'http://img.provider/sk.jpg',
                plot: 'Bir virüs…',
                last_modified: '1720000000',
                tmdb: 5005005,
              },
            ]),
          );
        case 'get_series_info':
          return response.end(
            json({
              info: { plot: 'Bir virüs insanları konuşturuyor.', genre: 'Dram' },
              episodes: {
                '1': [
                  {
                    id: '77001',
                    episode_num: 1,
                    title: 'Bölüm 1',
                    container_extension: 'mp4',
                    info: { duration_secs: 2700 },
                  },
                  {
                    id: '77002',
                    episode_num: 2,
                    title: 'Bölüm 2',
                    container_extension: 'mp4',
                    info: {},
                  },
                  // Listed before it airs, as some panels do.
                  {
                    id: '77003',
                    episode_num: 3,
                    title: 'Sıcak Kafa - S01E03 - Sessizlik',
                    container_extension: 'mp4',
                    info: { releasedate: '2099-01-15' },
                  },
                ],
              },
            }),
          );
        case 'get_vod_info':
          return response.end(
            json({
              info: {
                plot: 'Kapadokya’da bir otel.',
                duration_secs: 11760,
                director: 'Nuri Bilge Ceylan',
                tmdb_id: 2002002,
              },
            }),
          );
      }
      response.statusCode = 404;
      return response.end();
    }
    if (url.pathname === '/xmltv.php') {
      if (!authorized) {
        response.statusCode = 401;
        return response.end();
      }
      response.setHeader('content-type', 'application/xml');
      return response.end(gzipSync(xmltv));
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
