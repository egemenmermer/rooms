import { createHash } from 'node:crypto';

/** Inline style only; the page runs no script, so a CSP hash is the whole style allowance. */
const STYLE = `
:root{color-scheme:dark;--bg:#0f0f14;--panel:#191922;--line:#2a2a38;--text:#ecebf5;--muted:#a3a1b8;--accent:#8b5cf6}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
main{width:100%;max-width:440px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px 24px}
.brand{margin:0 0 20px;font-size:13px;letter-spacing:.12em;color:var(--muted)}
h1{margin:0 0 6px;font-size:22px;line-height:1.3}
.meta{margin:0 0 24px;color:var(--muted);font-size:14px}
ol{margin:0;padding:0;list-style:none;display:grid;gap:18px}
li{display:grid;gap:8px}
.step{font-weight:600}
.step span{display:inline-block;min-width:22px;color:var(--accent)}
a.button{display:block;text-align:center;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:600;background:var(--accent);color:#fff}
a.secondary{background:transparent;border:1px solid var(--line);color:var(--text)}
.hint{margin:0;color:var(--muted);font-size:13px}
.note{margin:24px 0 0;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
`;
export const INVITE_PAGE_STYLE_HASH = createHash('sha256').update(STYLE).digest('base64');

export const INVITE_PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': `default-src 'none'; style-src 'sha256-${INVITE_PAGE_STYLE_HASH}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
} as const;

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const formatExpiry = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));

function page(body: string) {
  // Generic preview metadata: link previews never reveal the community name.
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="Tayfa daveti">
<meta property="og:description" content="Arkadaşların seni Tayfa'ya davet etti.">
<title>Tayfa daveti</title>
<style>${STYLE}</style>
</head>
<body><main><p class="brand">Tayfa</p>${body}</main></body>
</html>`;
}

export type InvitePageState =
  | {
      kind: 'valid';
      communityName: string | null;
      expiresAt: string;
      appLink: string | null;
      downloadUrl: string;
    }
  | { kind: 'invalid' };

export function renderInvitePage(state: InvitePageState): { status: number; html: string } {
  if (state.kind === 'invalid')
    return {
      status: 404,
      html: page(
        `<h1>Bu davet bağlantısı artık geçerli değil</h1>
<p class="meta">Süresi dolmuş, kişi sınırı dolmuş ya da iptal edilmiş olabilir.</p>
<p class="hint">Seni davet eden kişiden yeni bir bağlantı iste.</p>`,
      ),
    };
  const title = state.communityName
    ? `${escape(state.communityName)} topluluğuna davet edildin`
    : 'Bir Tayfa topluluğuna davet edildin';
  const open = state.appLink
    ? `<li><p class="step"><span>2</span>Daveti uygulamada aç</p>
<a class="button secondary" href="${escape(state.appLink)}">Tayfa'da aç</a>
<p class="hint">Açılmazsa Tayfa'da <b>Kayıt ol</b> sekmesine bu sayfanın adresini yapıştır.</p></li>`
    : `<li><p class="step"><span>2</span>Daveti uygulamada aç</p>
<p class="hint">Tayfa'da <b>Kayıt ol</b> sekmesine bu sayfanın adresini yapıştır.</p></li>`;
  return {
    status: 200,
    html: page(
      `<h1>${title}</h1>
<p class="meta">Son geçerlilik: ${escape(formatExpiry(state.expiresAt))}</p>
<ol>
<li><p class="step"><span>1</span>Tayfa'yı bilgisayarına kur</p>
<a class="button" href="${escape(state.downloadUrl)}">Uygulamayı indir</a>
<p class="hint">macOS (Apple Silicon) ve Windows için.</p></li>
${open}
</ol>
<p class="note">Tayfa masaüstünde çalışır. Bu bağlantıyı telefondan açtıysan bilgisayarına gönder.</p>`,
    ),
  };
}
