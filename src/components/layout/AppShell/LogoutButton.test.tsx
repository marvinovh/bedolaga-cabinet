// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ telegram: false, close: vi.fn() }));
vi.mock('@/platform/hooks/usePlatform', () => ({ useIsTelegram: () => state.telegram }));
vi.mock('@/hooks/useTelegramSDK', () => ({ closeTelegramApp: state.close }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { LogoutButton } from './LogoutButton';

afterEach(() => {
  cleanup();
  state.telegram = false;
  vi.clearAllMocks();
});

for (const variant of ['menu', 'icon', 'profile'] as const) {
  describe(`logout: ${variant}`, () => {
    const label = variant === 'profile' ? 'rv.profile.logout' : 'nav.logout';

    it('logs out in the browser without trying to close its window', () => {
      const logout = vi.fn();
      render(<LogoutButton variant={variant} onLogout={logout} />);
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(logout).toHaveBeenCalledOnce();
      expect(state.close).not.toHaveBeenCalled();
    });

    it('is available in Telegram and clears the session before closing the Mini App', () => {
      state.telegram = true;
      const logout = vi.fn();
      render(<LogoutButton variant={variant} onLogout={logout} />);
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(logout).toHaveBeenCalledOnce();
      expect(state.close).toHaveBeenCalledOnce();
      expect(logout.mock.invocationCallOrder[0]).toBeLessThan(
        state.close.mock.invocationCallOrder[0],
      );
    });
  });
}
