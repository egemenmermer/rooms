// Source scanning shared by scripts/i18n-scan.mjs and tests/i18n-catalog.test.ts. See docs/I18N.md.
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
/** Code that renders or sends interface text. */
export const defaultRoots = ['apps/desktop', 'packages'];
const skippedDirectories = new Set(['node_modules', 'dev', 'locales', 'native', 'public']);
// Catalog sources: Turkish here is a message key or a legacy translation, never leaked text.
const catalogSources = new Set(['apps/desktop/src/i18n.ts', 'apps/desktop/src/messages.tr.ts']);

export function sourceFiles(roots = defaultRoots) {
  const files = [];
  const walk = (path) => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path))
        if (!skippedDirectories.has(name)) walk(join(path, name));
      return;
    }
    const rel = relative(repoRoot, path).split(sep).join('/');
    if (!/\.(ts|tsx)$/.test(rel) || /\.(test|spec)\.tsx?$/.test(rel) || /\.d\.ts$/.test(rel))
      return;
    files.push(rel);
  };
  for (const root of roots) walk(join(repoRoot, root));
  return files.sort();
}

const turkishLetters = /[çğıöşüÇĞİÖŞÜ]/;
// Common Turkish words that need no Turkish letters; whole words only.
const turkishWords =
  /(?:^|[\s"'“(])(?:ve|bir|ile|bu|yok|daha|sonra|tekrar|yeniden|dene|kaydet|kapat|sil|ekle|ara|geri|tamam|ayarlar|sohbet|salon|salonda|salona|sinema|sinemada|oda|odada|odaya|odadan|odalar|topluluk|sunucu|sunucuya|sunucuda|kanal|kanala|kanallar|mesaj|mesajlar|hata|davet|dizi|diziler|filmler|ses|sesi|mikrofon|kamera|ekran|oyun|masa|anket|rol|roller|izin|yetki|hesap|parola|yeni|eski|bekle|bekliyor|bekleyen|aktif|indir|herkes|kimse|kendi|bilgi|ayar|kurulum|devam|bitir|durdur|oynat|sustur|kaydedildi|eklendi|silindi|gerekli|gerekiyor|olarak|veya|ama|gibi|kadar|yine|zaten|sadece|liste|kumanda|sezon|profil|durum|gizli|genel|metin|dosya|resim|yakinda|bekleniyor|hazirla)(?=$|[\s.,:;!?)"'”…])/i;
const identifierLike = /^[\w.:/#@?&=%+-]*$/;

export function looksTurkish(text) {
  const value = text.trim();
  if (!value) return false;
  if (turkishLetters.test(value)) return true;
  // A lone lowercase token is an id or class name; a capitalised one may be a button label.
  if (identifierLike.test(value) && value === value.toLowerCase()) return false;
  return turkishWords.test(value);
}

// JSX attributes whose strings are never shown to people.
const technicalAttributes = new Set([
  'className',
  'id',
  'key',
  'href',
  'src',
  'type',
  'role',
  'name',
  'htmlFor',
  'rel',
  'target',
  'autoComplete',
  'inputMode',
  'method',
  'variant',
  'size',
  'tone',
  'icon',
  'lang',
  'accept',
  'pattern',
  'data-testid',
]);
const translatorNames = new Set(['t', 'tr']);

function isTranslatorCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    translatorNames.has(node.expression.text)
  );
}

function ignoredByComment(line, lines) {
  return /i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '');
}

/**
 * Parses one file. `calls` holds literal first arguments of t()/tr(); `literals` every string
 * literal; `leaks` Turkish-looking text outside a translator call.
 */
export function extract(file) {
  const text = readFileSync(join(repoRoot, file), 'utf8');
  const lines = text.split('\n');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const calls = [];
  const literals = new Set();
  const leaks = [];
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const leak = (node, value) => {
    const line = lineOf(node);
    if (!catalogSources.has(file) && looksTurkish(value) && !ignoredByComment(line, lines))
      leaks.push({ file, line: line + 1, text: value.trim().replace(/\s+/g, ' ') });
  };
  const visit = (node, guarded) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console'
    )
      return;
    if (ts.isJsxAttribute(node) && technicalAttributes.has(node.name.getText(source))) return;
    // sample(tr, en) in development fixtures already picks the language.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'sample'
    ) {
      const [first] = node.arguments;
      node.forEachChild((child) => visit(child, child === first));
      return;
    }
    if (isTranslatorCall(node)) {
      const [first] = node.arguments;
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)))
        calls.push({ key: first.text, line: lineOf(first) + 1, name: node.expression.text });
      else if (first && ts.isTemplateExpression(first))
        leaks.push({
          file,
          line: lineOf(first) + 1,
          text: `${node.expression.text}() takes a plain string with {name} placeholders, not a template`,
        });
      node.forEachChild((child) => visit(child, child === first));
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.add(node.text);
      if (!guarded && !ts.isLiteralTypeNode(node.parent)) leak(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
      if (!guarded) leak(node, parts.join(' … '));
      node.templateSpans.forEach((span) => visit(span.expression, false));
      return;
    }
    if (ts.isJsxText(node)) {
      if (!guarded) leak(node, node.text);
      return;
    }
    node.forEachChild((child) => visit(child, guarded));
  };
  visit(source, false);
  return { calls, literals, leaks };
}
