import { t } from '../../i18n';

export function pokerCategory(category: string) {
  return (
    (
      {
        'high-card': t('Yüksek kart'),
        'one-pair': t('Bir çift'),
        'two-pair': t('İki çift'),
        'three-of-a-kind': t('Üçlü'),
        straight: t('Kent'),
        flush: t('Renk'),
        'full-house': 'Full house',
        'four-of-a-kind': t('Kare'),
        'straight-flush': t('Sıralı renk'),
      } as Record<string, string>
    )[category] ?? t('El')
  );
}
