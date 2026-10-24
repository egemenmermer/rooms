import { t } from '@rooms/i18n';
import { safeMediaLabel } from './playlist';

function categoryId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const id = String(value).trim();
  if (/^\d{1,20}$/.test(id)) return id.replace(/^0+(?=\d)/, '');
}
function categoryName(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || /^\d+$/.test(value.trim())) return;
  return safeMediaLabel(value, t('Kategori adı alınamadı'));
}
export function xtreamCategories(value: unknown): Map<string, string> {
  let rows: unknown[] = [];
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === 'object') {
    const wrapped = value as Record<string, unknown>;
    if (Array.isArray(wrapped.categories)) rows = wrapped.categories;
    else if (Array.isArray(wrapped.data)) rows = wrapped.data;
    else
      rows = Object.entries(wrapped)
        .filter(([id]) => categoryId(id))
        .map(([id, row]) => (row && typeof row === 'object' ? { category_id: id, ...row } : null));
  }
  const result = new Map<string, string>();
  if (rows.length > 10000) return result;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = categoryId(item.category_id),
      name = categoryName(item.category_name);
    if (id !== undefined && name) result.set(id, name);
  }
  return result;
}
export function xtreamGroup(
  stream: Record<string, unknown>,
  categories: Map<string, string>,
): string {
  return (
    categories.get(categoryId(stream.category_id) ?? '') ??
    categoryName(stream.category_name) ??
    categoryName(stream['group-title']) ??
    t('Kategori adı alınamadı')
  );
}
