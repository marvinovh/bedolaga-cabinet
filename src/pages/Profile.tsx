import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@/platform';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/auth';
import { displayName } from '../utils/displayName';
import { authApi } from '../api/auth';
import { isValidEmail } from '../utils/validation';
import { useCountdown } from '../hooks/useCountdown';
import { getApiErrorMessage } from '../utils/api-error';
import {
  notificationsApi,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '../api/notifications';
import { brandingApi, type EmailAuthEnabled } from '../api/branding';
import { UI } from '../config/constants';
import { InfoRow } from '@/components/data-display/InfoRow';
import { Button } from '@/components/primitives/Button';
import { Switch } from '@/components/primitives/Switch';
import { staggerContainer, staggerItem } from '@/components/motion/transitions';
import { CheckIcon, ArrowRightIcon, PencilIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Avatar } from '@/components/rv/Avatar';
import { useTheme } from '@/hooks/useTheme';
import { LogoutButton } from '@/components/layout/AppShell/LogoutButton';
import { themeColorsApi } from '@/api/themeColors';
import './Profile.css';

function ProfileChapter({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <motion.section variants={staggerItem} className="rv-profile-chapter">
      <span className="rv-d rv-profile-number" aria-hidden="true">
        {number}
      </span>
      <div className="rv-profile-chapter-body">
        <h2 className="rv-d rv-profile-chapter-title">{title}</h2>
        {children}
      </div>
    </motion.section>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const { isDark, toggleTheme } = useTheme();
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggleTheme = !!(enabledThemes?.dark && enabledThemes?.light);
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Inline email change flow
  const [changeEmailStep, setChangeEmailStep] = useState<'email' | 'code' | 'success' | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [changeCode, setChangeCode] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [resendCooldown, startResendCooldown] = useCountdown();
  const [verificationResendCooldown, startVerificationResendCooldown] = useCountdown();
  const newEmailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Check if email auth is enabled
  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;
  const isEmailVerificationEnabled = emailAuthConfig?.verification_enabled ?? true;

  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => {
      setSuccess(t('profile.verificationResent'));
      setError(null);
      startVerificationResendCooldown(UI.RESEND_COOLDOWN_SEC);
    },
    onError: (err: unknown) => {
      setError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      setSuccess(null);
    },
  });

  // Email change mutations
  const requestEmailChangeMutation = useMutation({
    mutationFn: (emailAddr: string) => authApi.requestEmailChange(emailAddr),
    onSuccess: async (data) => {
      setChangeError(null);
      if (data.expires_in_minutes === 0) {
        // Unverified email was replaced directly
        setChangeEmailStep('success');
        const updatedUser = await authApi.getMe();
        setUser(updatedUser);
      } else {
        setChangeEmailStep('code');
        startResendCooldown(UI.RESEND_COOLDOWN_SEC);
      }
    },
    onError: (err: unknown) => {
      const detail = getApiErrorMessage(err, '');
      if (detail.includes('already registered') || detail.includes('already in use')) {
        setChangeError(t('profile.changeEmail.emailAlreadyUsed'));
      } else if (detail.includes('same as current')) {
        setChangeError(t('profile.changeEmail.sameEmail'));
      } else if (detail.includes('rate limit') || detail.includes('too many')) {
        setChangeError(t('profile.changeEmail.tooManyRequests'));
      } else {
        setChangeError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      }
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: (verificationCode: string) => authApi.verifyEmailChange(verificationCode),
    onSuccess: async () => {
      setChangeError(null);
      setChangeEmailStep('success');
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      // Note: auth user lives in the zustand store, not in React Query —
      // the explicit setUser above IS the refresh. No ['user'] query exists.
    },
    onError: (err: unknown) => {
      const detail = getApiErrorMessage(err, '');
      if (detail.includes('invalid') || detail.includes('wrong')) {
        setChangeError(t('profile.changeEmail.invalidCode'));
      } else if (detail.includes('expired')) {
        setChangeError(t('profile.changeEmail.codeExpired'));
      } else {
        setChangeError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      }
    },
  });

  // Auto-focus inputs on step change (skip on Telegram — keyboard hides bottom nav)
  const { platform: profilePlatform } = usePlatform();
  useEffect(() => {
    if (profilePlatform === 'telegram') return;
    const timer = setTimeout(() => {
      if (changeEmailStep === 'email') newEmailInputRef.current?.focus();
      else if (changeEmailStep === 'code') codeInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [changeEmailStep, profilePlatform]);

  // Auto-close success after 3s
  useEffect(() => {
    if (changeEmailStep !== 'success') return;
    const timer = setTimeout(() => resetChangeEmail(), 3000);
    return () => clearTimeout(timer);
  }, [changeEmailStep]);

  const resetChangeEmail = () => {
    setChangeEmailStep(null);
    setNewEmail('');
    setChangeCode('');
    setChangeError(null);
    startResendCooldown(0);
  };

  const handleSendChangeCode = () => {
    setChangeError(null);
    if (!newEmail.trim()) {
      setChangeError(t('profile.emailRequired'));
      return;
    }
    if (!isValidEmail(newEmail.trim())) {
      setChangeError(t('profile.invalidEmail'));
      return;
    }
    if (user?.email && newEmail.toLowerCase().trim() === user.email.toLowerCase()) {
      setChangeError(t('profile.changeEmail.sameEmail'));
      return;
    }
    requestEmailChangeMutation.mutate(newEmail.trim());
  };

  const handleVerifyChangeCode = () => {
    setChangeError(null);
    if (!changeCode.trim()) {
      setChangeError(t('profile.changeEmail.enterCode'));
      return;
    }
    if (changeCode.trim().length < 4) {
      setChangeError(t('profile.changeEmail.invalidCode'));
      return;
    }
    verifyEmailChangeMutation.mutate(changeCode.trim());
  };

  const handleResendChangeCode = () => {
    if (resendCooldown > 0) return;
    requestEmailChangeMutation.mutate(newEmail.trim());
  };

  const { data: notificationSettings, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: notificationsApi.getSettings,
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: notificationsApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
  });

  const handleNotificationToggle = (key: keyof NotificationSettings, value: boolean) => {
    const update: NotificationSettingsUpdate = { [key]: value };
    updateNotificationsMutation.mutate(update);
  };

  const handleNotificationValue = (key: keyof NotificationSettings, value: number) => {
    const update: NotificationSettingsUpdate = { [key]: value };
    updateNotificationsMutation.mutate(update);
  };

  const registeredAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' })
    : null;
  const accountId = user?.telegram_id ?? user?.id;

  return (
    <motion.div
      className="rv-profile-editorial"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <div className="rv-profile-body">
        <motion.aside variants={staggerItem} className="rv-profile-aside">
          <motion.header variants={staggerItem} className="rv-profile-heading">
            <div className="min-w-0">
              <h1 className="rv-d rv-profile-title">
                <span>{t('rv.profile.editorial.your')}</span>
                <span className="rv-pill">{t('profile.title')}</span>
              </h1>
            </div>
          </motion.header>
          <section className="bento-card rv-profile-identity">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <Avatar size={64} className="border-accent-500 bg-accent-500 text-[#111]" />
              <div className="min-w-0">
                <p className="rv-d rv-profile-name">{displayName(user)}</p>
                <p className="rv-profile-caption">
                  {user?.username ? `@${user.username}` : user?.email}
                </p>
              </div>
            </div>
            {accountId != null && (
              <div className="rv-profile-account-id">
                <p className="rv-d rv-profile-id">{accountId}</p>
                <p className="rv-profile-caption">
                  {t(user?.telegram_id ? 'profile.telegramId' : 'rv.profile.editorial.accountId')}
                </p>
              </div>
            )}
            {registeredAt && (
              <p className="rv-profile-caption">{t('rv.profile.since', { date: registeredAt })}</p>
            )}
          </section>
          <p className="rv-profile-caption">{t('rv.profile.editorial.description')}</p>
        </motion.aside>
        <div className="rv-profile-chapters">
          {/* Email Section - only show when email auth is enabled */}
          {isEmailAuthEnabled && (
            <ProfileChapter number="01" title={t('rv.profile.editorial.email')}>
              {user?.email ? (
                <div className="space-y-4">
                  <InfoRow
                    divider
                    label={t('profile.accounts.providers.email')}
                    value={
                      <>
                        <span>{user.email}</span>
                        {user.email_verified ? (
                          <span className="badge-success">{t('profile.verified')}</span>
                        ) : isEmailVerificationEnabled ? (
                          <span className="badge-warning">{t('profile.notVerified')}</span>
                        ) : null}
                      </>
                    }
                  />

                  {!user.email_verified && isEmailVerificationEnabled && (
                    <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
                      <p className="mb-4 text-sm text-warning-400">
                        {t('profile.verificationRequired')}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          onClick={() => resendVerificationMutation.mutate()}
                          loading={resendVerificationMutation.isPending}
                          disabled={verificationResendCooldown > 0}
                        >
                          {verificationResendCooldown > 0
                            ? t('profile.resendIn', { seconds: verificationResendCooldown })
                            : t('profile.resendVerification')}
                        </Button>
                        <Button variant="secondary" onClick={() => setChangeEmailStep('email')}>
                          <PencilIcon className="h-4 w-4" />
                          {t('profile.changeEmail.button')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {user.email_verified && (
                    // Кнопка не сжимается в две строки: не хватает места — уходит под текст.
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 basis-48 text-sm text-dark-400">
                        {t('profile.canLoginWithEmail')}
                      </p>
                      <Button
                        variant="secondary"
                        className="shrink-0 whitespace-nowrap"
                        onClick={() => setChangeEmailStep('email')}
                      >
                        <PencilIcon className="h-4 w-4" />
                        {t('profile.changeEmail.button')}
                      </Button>
                    </div>
                  )}

                  {/* Inline email change flow */}
                  <AnimatePresence>
                    {changeEmailStep === 'email' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 border-t border-dark-800/50 pt-4">
                          <label
                            htmlFor="profile-new-email"
                            className="block text-sm font-medium text-dark-400"
                          >
                            {t('profile.changeEmail.newEmail')}
                          </label>
                          <input
                            id="profile-new-email"
                            ref={newEmailInputRef}
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSendChangeCode();
                              }
                            }}
                            placeholder="new@email.com"
                            className="input w-full"
                            autoComplete="email"
                          />
                          {changeError && (
                            <p role="alert" className="text-sm text-error-400">
                              {changeError}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3">
                            <Button
                              onClick={handleSendChangeCode}
                              loading={requestEmailChangeMutation.isPending}
                              disabled={!newEmail.trim()}
                            >
                              {t('profile.changeEmail.sendCode')}
                            </Button>
                            <Button variant="secondary" onClick={resetChangeEmail}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {changeEmailStep === 'code' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 border-t border-dark-800/50 pt-4">
                          <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 p-3">
                            <p className="text-sm text-accent-400">
                              {t('profile.changeEmail.codeSentTo', { email: newEmail })}
                            </p>
                          </div>
                          <label
                            htmlFor="profile-email-code"
                            className="block text-sm font-medium text-dark-400"
                          >
                            {t('profile.changeEmail.verificationCode')}
                          </label>
                          <input
                            id="profile-email-code"
                            ref={codeInputRef}
                            type="text"
                            inputMode="numeric"
                            value={changeCode}
                            onChange={(e) => setChangeCode(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleVerifyChangeCode();
                              }
                            }}
                            placeholder="000000"
                            maxLength={6}
                            className="input w-full text-center text-2xl tracking-[0.5em]"
                            autoComplete="one-time-code"
                          />
                          {changeError && (
                            <p role="alert" className="text-sm text-error-400">
                              {changeError}
                            </p>
                          )}
                          {/* Три действия на телефон в строку не влезают — переносятся. */}
                          <div className="flex flex-wrap items-center gap-3">
                            <Button
                              onClick={handleVerifyChangeCode}
                              loading={verifyEmailChangeMutation.isPending}
                              disabled={!changeCode.trim()}
                            >
                              {t('profile.changeEmail.verify')}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setChangeEmailStep('email');
                                setChangeCode('');
                                setChangeError(null);
                              }}
                            >
                              {t('common.back')}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handleResendChangeCode}
                              disabled={resendCooldown > 0 || requestEmailChangeMutation.isPending}
                            >
                              {resendCooldown > 0
                                ? t('profile.changeEmail.resendIn', { seconds: resendCooldown })
                                : t('profile.changeEmail.resendCode')}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {changeEmailStep === 'success' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-dark-800/50 pt-4">
                          <div className="flex items-center gap-3 rounded-xl border border-success-500/30 bg-success-500/10 p-4">
                            <CheckIcon />
                            <div>
                              <p className="font-medium text-success-400">
                                {t('profile.changeEmail.success')}
                              </p>
                              <p className="text-sm text-dark-400">{newEmail}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-dark-400">{t('profile.linkEmailDescription')}</p>
                  <Button variant="primary" onClick={() => navigate('/profile/accounts')}>
                    {t('profile.linkEmail')}
                  </Button>
                </div>
              )}

              {(error || success) && user?.email && (
                <div className="mt-4">
                  {error && (
                    <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-4 text-sm text-error-400">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="rounded-xl border border-success-500/30 bg-success-500/10 p-4 text-sm text-success-400">
                      {success}
                    </div>
                  )}
                </div>
              )}
            </ProfileChapter>
          )}

          <ProfileChapter
            number={isEmailAuthEnabled ? '02' : '01'}
            title={t('rv.profile.editorial.login')}
          >
            <div className="rv-profile-inline">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-dark-100">{t('rv.profile.loginMethods')}</p>
                <p className="mt-1 text-sm text-dark-400">{t('profile.accounts.subtitle')}</p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/profile/accounts')}>
                {t('profile.accounts.goToAccounts')}
                <ArrowRightIcon className="h-4 w-4 shrink-0" />
              </Button>
            </div>
          </ProfileChapter>

          <ProfileChapter
            number={isEmailAuthEnabled ? '03' : '02'}
            title={t('rv.profile.editorial.appearance')}
          >
            <div className="rv-profile-inline rv-profile-appearance">
              {canToggleTheme && (
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-bold text-dark-100">{t('rv.profile.theme')}</p>
                  <div className="rv-seg" role="group" aria-label={t('rv.profile.theme')}>
                    <button
                      type="button"
                      aria-pressed={isDark}
                      className={isDark ? 'on' : undefined}
                      onClick={() => !isDark && toggleTheme()}
                    >
                      {t('rv.profile.dark')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={!isDark}
                      className={!isDark ? 'on' : undefined}
                      onClick={() => isDark && toggleTheme()}
                    >
                      {t('rv.profile.light')}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <p className="text-sm font-bold text-dark-100">{t('rv.profile.language')}</p>
                <LanguageSwitcher />
              </div>
            </div>
          </ProfileChapter>

          <ProfileChapter
            number={isEmailAuthEnabled ? '04' : '03'}
            title={t('rv.profile.editorial.notifications')}
          >
            {notificationsLoading ? (
              <SkeletonGroup className="space-y-3">
                <Skeleton variant="card" count={3} className="h-16" />
              </SkeletonGroup>
            ) : notificationSettings ? (
              <div className="space-y-6">
                {/* Subscription Expiry */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-dark-100">
                        {t('profile.notifications.subscriptionExpiry')}
                      </p>
                      <p className="text-sm text-dark-400">
                        {t('profile.notifications.subscriptionExpiryDesc')}
                      </p>
                    </div>
                    <Switch
                      aria-label={t('profile.notifications.subscriptionExpiry')}
                      checked={notificationSettings.subscription_expiry_enabled}
                      onCheckedChange={(checked) =>
                        handleNotificationToggle('subscription_expiry_enabled', checked)
                      }
                    />
                  </div>
                  {notificationSettings.subscription_expiry_enabled && (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-dark-400">
                        {t('profile.notifications.daysBeforeExpiry')}
                      </span>
                      <select
                        aria-label={t('profile.notifications.daysBeforeExpiry')}
                        value={notificationSettings.subscription_expiry_days}
                        onChange={(e) =>
                          handleNotificationValue(
                            'subscription_expiry_days',
                            Number(e.target.value),
                          )
                        }
                        className="input w-24 !py-2"
                      >
                        {[1, 2, 3, 5, 7, 14].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Traffic Warning */}
                <div className="space-y-3 border-t-2 border-dark-700 pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-dark-100">
                        {t('profile.notifications.trafficWarning')}
                      </p>
                      <p className="text-sm text-dark-400">
                        {t('profile.notifications.trafficWarningDesc')}
                      </p>
                    </div>
                    <Switch
                      aria-label={t('profile.notifications.trafficWarning')}
                      checked={notificationSettings.traffic_warning_enabled}
                      onCheckedChange={(checked) =>
                        handleNotificationToggle('traffic_warning_enabled', checked)
                      }
                    />
                  </div>
                  {notificationSettings.traffic_warning_enabled && (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-dark-400">
                        {t('profile.notifications.atPercent')}
                      </span>
                      <select
                        aria-label={t('profile.notifications.atPercent')}
                        value={notificationSettings.traffic_warning_percent}
                        onChange={(e) =>
                          handleNotificationValue('traffic_warning_percent', Number(e.target.value))
                        }
                        className="input w-24 !py-2"
                      >
                        {[50, 70, 80, 90, 95].map((p) => (
                          <option key={p} value={p}>
                            {p}%
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Balance Low */}
                <div className="space-y-3 border-t-2 border-dark-700 pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-dark-100">
                        {t('profile.notifications.balanceLow')}
                      </p>
                      <p className="text-sm text-dark-400">
                        {t('profile.notifications.balanceLowDesc')}
                      </p>
                    </div>
                    <Switch
                      aria-label={t('profile.notifications.balanceLow')}
                      checked={notificationSettings.balance_low_enabled}
                      onCheckedChange={(checked) =>
                        handleNotificationToggle('balance_low_enabled', checked)
                      }
                    />
                  </div>
                  {notificationSettings.balance_low_enabled && (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-dark-400">
                        {t('profile.notifications.threshold')}
                      </span>
                      <input
                        type="number"
                        aria-label={t('profile.notifications.threshold')}
                        value={notificationSettings.balance_low_threshold}
                        onChange={(e) =>
                          handleNotificationValue('balance_low_threshold', Number(e.target.value))
                        }
                        min={0}
                        className="input w-28 !py-2"
                      />
                    </div>
                  )}
                </div>

                {/* News */}
                <div className="flex items-center justify-between gap-4 border-t-2 border-dark-700 pt-5">
                  <div>
                    <p className="font-bold text-dark-100">{t('profile.notifications.news')}</p>
                    <p className="text-sm text-dark-400">{t('profile.notifications.newsDesc')}</p>
                  </div>
                  <Switch
                    aria-label={t('profile.notifications.news')}
                    checked={notificationSettings.news_enabled}
                    onCheckedChange={(checked) => handleNotificationToggle('news_enabled', checked)}
                  />
                </div>

                {/* Promo Offers */}
                <div className="flex items-center justify-between gap-4 border-t-2 border-dark-700 pt-5">
                  <div>
                    <p className="font-bold text-dark-100">
                      {t('profile.notifications.promoOffers')}
                    </p>
                    <p className="text-sm text-dark-400">
                      {t('profile.notifications.promoOffersDesc')}
                    </p>
                  </div>
                  <Switch
                    aria-label={t('profile.notifications.promoOffers')}
                    checked={notificationSettings.promo_offers_enabled}
                    onCheckedChange={(checked) =>
                      handleNotificationToggle('promo_offers_enabled', checked)
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-dark-400">{t('profile.notifications.unavailable')}</p>
            )}
          </ProfileChapter>
        </div>
      </div>

      <motion.footer variants={staggerItem} className="rv-profile-footer">
        <Link
          to="/info"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-dark-400 hover:text-dark-100"
        >
          {t('rv.profile.docs')}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <LogoutButton variant="profile" onLogout={logout} />
      </motion.footer>
    </motion.div>
  );
}
