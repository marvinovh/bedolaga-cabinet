import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-950',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      // RichVPN: варианты — классы UI-кита (.btn-*: Bebas, рамка 2px,
      // жёсткая тень у главной); см. конец globals.css.
      variant: {
        primary: 'btn btn-primary',
        secondary: 'btn btn-secondary',
        ghost: 'btn btn-ghost',
        destructive: 'btn btn-danger',
        outline: 'btn btn-secondary',
        link: [
          'font-bold text-dark-100 underline decoration-accent-500 decoration-2 underline-offset-[3px]',
        ],
      },
      size: {
        sm: '!min-h-9 !px-3 !py-2 !text-[16px] !rounded-[9px]',
        md: '!min-h-11',
        lg: 'rv-btn-lg',
        icon: '!h-10 !w-10 !min-h-0 !p-0',
        'icon-sm': '!h-8 !w-8 !min-h-0 !p-0',
        'icon-lg': '!h-12 !w-12 !min-h-0 !p-0',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
