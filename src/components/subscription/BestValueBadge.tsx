import { useTranslation } from 'react-i18next';

/**
 * Отметка периода, выбранного оператором как самый выгодный.
 *
 * Цвет намеренно не accent и не success: accent уже означает «этот вариант
 * выбран», success — размер скидки. Третий смысл третьим цветом, иначе рядом со
 * скидкой «−25 %» отметка читается как её продолжение.
 */
export function BestValueBadge({ className }: { className?: string }) {
  const { t } = useTranslation();

  return <span className={`rv-badge ${className ?? ''}`}>{t('subscription.bestValue')}</span>;
}

/** Цвет рамки выделенного периода — тот же токен, что и у отметки. */
export const BEST_VALUE_BORDER = 'rgb(var(--color-accent-500))';

/**
 * Рамка отмеченного варианта — одна на все витрины: золотой контур снаружи,
 * а у выбранного ещё и кольцо выбора внутри. Выбор не затирает золото, иначе
 * подсказка пропадала ровно у того варианта, к которому вела. Плашку при этом
 * ставить первой строкой карточки. Продление рисует то же самое через
 * BEST_VALUE_BORDER — там стили карточки инлайновые.
 */
export function bestValueFrame(selected: boolean): string {
  // RichVPN: «хит» — лаймовая карточка (как в макете «Выбор тарифа»).
  return selected ? 'rv-card-acc rv-shadow' : 'rv-card-acc';
}
