/**
 * Shared button styling for connection blocks. The config-driven blocks
 * (BlockButtons) and the Happ TV quick-connect both render through this so the
 * latter adapts to exactly the same visual language as the styles coming from
 * the subscription-page config — no divergent one-off button styles.
 */
export function blockButtonClass(variant: 'light' | 'subtle', _isLight?: boolean): string {
  // RichVPN: главные кнопки шага — лаймовые, второстепенные — ghost (UI-кит).
  return variant === 'light' ? 'btn btn-primary rv-btn-lg w-full' : 'btn btn-secondary w-full';
}
