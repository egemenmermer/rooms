// Lists Turkish-looking interface text outside t()/tr(). Usage:
//   node scripts/i18n-scan.mjs [path ...] [--check]
// Paths default to apps/desktop and packages. Mark deliberate Turkish with an `i18n-ignore` comment
// on the same or previous line. See docs/I18N.md.
import { defaultRoots, extract, sourceFiles } from './i18n-extract.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const roots = args.filter((arg) => !arg.startsWith('--'));
const files = sourceFiles(roots.length ? roots : defaultRoots);
let total = 0;
for (const file of files) {
  const { leaks } = extract(file);
  total += leaks.length;
  for (const leak of leaks) console.log(`${leak.file}:${leak.line}  ${leak.text.slice(0, 120)}`);
}
console.error(`${total} untranslated string(s) in ${files.length} file(s).`);
if (check && total) process.exitCode = 1;
