import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { BlockRendererProps } from './types';

/**
 * Шаги подключения — макет «03 · Подключение — мастер»: активный шаг раскрыт
 * (контурная цифра «01», заголовок Bebas, кнопки), остальные свёрнуты в строку.
 * Рисуется для любого стиля из конфига подписки — единый язык кабинета.
 */
export function RvStepsBlock({ blocks, getLocalizedText, renderBlockButtons }: BlockRendererProps) {
  const { t } = useTranslation();
  const visible = blocks.filter(
    (b) =>
      getLocalizedText(b.title) ||
      getLocalizedText(b.description) ||
      b.buttons?.length ||
      b.customNode,
  );
  const [active, setActive] = useState(0);
  if (!visible.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="rv-prog flex-1">
          {visible.map((_, i) => (
            <i key={i} className={i <= active ? 'on' : undefined} />
          ))}
        </div>
        <span className="shrink-0 text-xs font-bold text-dark-400">
          {t('rv.connect.step', { n: active + 1, total: visible.length })}
        </span>
      </div>

      {visible.map((block, i) => {
        const open = i === active;
        const n = String(i + 1).padStart(2, '0');
        if (!open) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'bento-card flex w-full items-center gap-4 !p-4 text-left',
                i < active && 'opacity-60',
              )}
            >
              <span className="rv-num text-[28px] text-dark-400">{i + 1}</span>
              <span className="text-base font-bold text-dark-300">
                {getLocalizedText(block.title)}
              </span>
            </button>
          );
        }
        return (
          <section key={i} className="bento-card !border-accent-500 !p-5">
            <div className="flex items-start gap-4">
              <span className="rv-stepn shrink-0">{n}</span>
              <h3 className="rv-d pt-1 text-[32px] text-dark-100">
                {getLocalizedText(block.title)}
              </h3>
            </div>
            {getLocalizedText(block.description) && (
              <p className="mt-4 whitespace-pre-line text-[17px] leading-snug text-dark-200">
                {getLocalizedText(block.description)}
              </p>
            )}
            <div className="rv-step-buttons">{renderBlockButtons(block.buttons, 'light')}</div>
            {block.customNode}
            {i < visible.length - 1 && (
              <button
                type="button"
                onClick={() => setActive(i + 1)}
                className="btn btn-secondary mt-3 w-full"
              >
                {t('rv.connect.next')}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
