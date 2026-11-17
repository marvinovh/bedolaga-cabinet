// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestEmailChange: vi.fn(),
  verifyEmailChange: vi.fn(),
  getMe: vi.fn(),
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
  setUser: vi.fn(),
  logout: vi.fn(),
  toggleTheme: vi.fn(),
  telegram: false,
}));
const user = {
  id: 42,
  telegram_id: 123456789,
  username: 'alex',
  first_name: 'Александр',
  email: 'alex@example.com',
  email_verified: true,
  created_at: '2026-09-12T00:00:00Z',
};
const settings = {
  subscription_expiry_enabled: true,
  subscription_expiry_days: 3,
  traffic_warning_enabled: true,
  traffic_warning_percent: 80,
  balance_low_enabled: true,
  balance_low_threshold: 100,
  news_enabled: true,
  promo_offers_enabled: false,
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ru' } }),
}));
vi.mock('@/store/auth', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user, setUser: mocks.setUser, logout: mocks.logout }),
}));
vi.mock('@/api/auth', () => ({
  authApi: {
    requestEmailChange: mocks.requestEmailChange,
    verifyEmailChange: mocks.verifyEmailChange,
    getMe: mocks.getMe,
  },
}));
vi.mock('@/api/notifications', () => ({
  notificationsApi: {
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
  },
}));
vi.mock('@/api/branding', () => ({ brandingApi: { getEmailAuthEnabled: vi.fn() } }));
vi.mock('@/api/themeColors', () => ({ themeColorsApi: { getEnabledThemes: vi.fn() } }));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: true, toggleTheme: mocks.toggleTheme }),
}));
vi.mock('@/platform', () => ({
  usePlatform: () => ({
    platform: mocks.telegram ? 'telegram' : 'web',
    haptic: { impact: vi.fn() },
  }),
}));
vi.mock('@/platform/hooks/usePlatform', () => ({ useIsTelegram: () => mocks.telegram }));
vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => <button type="button">Language</button>,
}));

import Profile from './Profile';

function renderProfile(emailEnabled = true, themes = { dark: true, light: true }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['email-auth-enabled'], {
    enabled: emailEnabled,
    verification_enabled: true,
  });
  client.setQueryData(['enabled-themes'], themes);
  client.setQueryData(['notification-settings'], settings);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/accounts" element={<p>Connected accounts screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  mocks.telegram = false;
  mocks.getSettings.mockResolvedValue(settings);
  mocks.updateSettings.mockResolvedValue(settings);
  mocks.requestEmailChange.mockResolvedValue({ expires_in_minutes: 10 });
  mocks.verifyEmailChange.mockResolvedValue({});
  mocks.getMe.mockResolvedValue({ ...user, email: 'new@example.com' });
});
afterEach(cleanup);

describe('editorial profile keeps account settings functional', () => {
  it('changes email through the code step and refreshes the authenticated user', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'profile.changeEmail.button' }));
    fireEvent.change(screen.getByLabelText('profile.changeEmail.newEmail'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'profile.changeEmail.sendCode' }));
    await waitFor(() => expect(mocks.requestEmailChange).toHaveBeenCalledWith('new@example.com'));
    const code = await screen.findByLabelText('profile.changeEmail.verificationCode');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'profile.changeEmail.verify' }));
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith({ ...user, email: 'new@example.com' }),
    );
    expect(screen.getByText('profile.changeEmail.success')).toBeTruthy();
  });

  it('sends notification changes and preserves theme, documents and account navigation', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('switch', { name: 'profile.notifications.news' }));
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({ news_enabled: false }, expect.anything()),
    );
    fireEvent.change(screen.getByLabelText('profile.notifications.daysBeforeExpiry'), {
      target: { value: '7' },
    });
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        { subscription_expiry_days: 7 },
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'rv.profile.light' }));
    expect(mocks.toggleTheme).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'rv.profile.docs' }).getAttribute('href')).toBe(
      '/info',
    );
    fireEvent.click(screen.getByRole('button', { name: 'profile.accounts.goToAccounts' }));
    expect(screen.getByText('Connected accounts screen')).toBeTruthy();
  });

  it('honors disabled email, single-theme and Telegram logout restrictions', () => {
    mocks.telegram = true;
    renderProfile(false, { dark: true, light: false });
    expect(screen.queryByText('alex@example.com')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'rv.profile.editorial.email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'rv.profile.light' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'rv.profile.logout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });
});
