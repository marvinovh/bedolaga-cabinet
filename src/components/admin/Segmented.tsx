import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  /** `md` — выборки страницы («Все · Истекают · Онлайн»), `sm` — фильтр внутри секции. */
  size?: 'sm' | 'md';
  className?: string;
}

// RichVPN: md — отдельные «таблетки» с рамкой (макет A2: «Все · С подпиской · …»),
// sm — компактный сегмент внутри секции.
const ITEM = {
  sm: 'h-8 px-3 text-xs rounded-[9px]',
  md: 'h-10 px-4 text-sm rounded-full border-2',
} as const;
const WRAP = {
  sm: 'gap-1 rounded-xl border-2 border-dark-700 bg-dark-900 p-1',
  md: 'gap-2',
} as const;

/**
 * Переключатель «один из»: «Все · Пополнения · Списания». Выбранное — залито акцентом:
 * бледная подсветка на кастомных темах сливалась с соседями, и не было видно, что нажато.
 * На узком экране листается по горизонтали, не переносится в две строки.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'sm',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('scrollbar-hide flex w-fit max-w-full overflow-x-auto', WRAP[size], className)}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'shrink-0 whitespace-nowrap font-bold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
              ITEM[size],
              selected
                ? 'border-accent-500 bg-accent-500 text-[#111]'
                : size === 'md'
                  ? 'border-dark-600 text-dark-100 hover:border-dark-400'
                  : 'border-transparent text-dark-300 hover:bg-dark-800 hover:text-dark-100',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
