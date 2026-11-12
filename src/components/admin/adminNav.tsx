// Меню админки: разделы и пункты. Общий источник для страницы меню
// (AdminPanel) и бокового меню админки на компьютере (AdminSidebar).
import {
  ArrowUpIcon,
  BellIcon,
  BroadcastIcon,
  CabinetIcon,
  ChartBarIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  HistoryIcon,
  LifebuoyIcon,
  LockIcon,
  MailIcon,
  MegaphoneIcon,
  NewsIcon,
  PartnerIcon,
  PercentIcon,
  PinIcon,
  RemnawaveIcon,
  SearchIcon,
  SendIcon,
  ServerIcon,
  SettingsIcon,
  ShareIcon,
  ShieldIcon,
  SparklesIcon,
  StatsChartIcon,
  SyncIcon,
  TagIcon,
  TicketIcon,
  TrafficIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
  WheelIcon,
  XIcon,
  RadarIcon,
  WallIcon,
} from '@/components/icons';

// Section nav icons (24x24 viewBox)
export const icons = {
  'bar-chart': <ChartBarIcon />,
  'credit-card': <CreditCardIcon />,
  activity: <TrafficIcon />,
  trending: <StatsChartIcon />,
  users: <UsersIcon />,
  ticket: <TicketIcon />,
  'shield-alert': <ShieldIcon />,
  tag: <TagIcon />,
  gift: <GiftIcon />,
  percent: <PercentIcon />,
  sparkle: <SparklesIcon />,
  wallet: <WalletIcon />,
  layout: <CabinetIcon />,
  newspaper: <NewsIcon />,
  megaphone: <MegaphoneIcon />,
  send: <SendIcon />,
  pin: <PinIcon />,
  bell: <BellIcon />,
  'circle-dot': <WheelIcon />,
  handshake: <PartnerIcon />,
  'arrow-up': <ArrowUpIcon />,
  network: <ShareIcon />,
  radio: <BroadcastIcon />,
  settings: <SettingsIcon />,
  app: <CabinetIcon />,
  server: <ServerIcon />,
  remnawave: <RemnawaveIcon />,
  radar: <RadarIcon />,
  wall: <WallIcon />,
  mail: <MailIcon />,
  refresh: <SyncIcon />,
  shield: <ShieldIcon />,
  'user-check': <UserPlusIcon />,
  lifebuoy: <LifebuoyIcon />,
  lock: <LockIcon />,
  scroll: <HistoryIcon />,
  'list-checks': <ClipboardIcon />,
  search: <SearchIcon />,
  'file-text': <FileTextIcon />,
  chevron: <ChevronRightIcon />,
  x: <XIcon />,
} as const;

export type IconName = keyof typeof icons;

// ─── Section Data ───

export interface AdminNavItem {
  name: string;
  icon: IconName;
  to: string;
  permission: string;
}

export interface AdminSection {
  id: string;
  titleKey: string;
  accent: string;
  gradient: string;
  items: AdminNavItem[];
}

export const sections: AdminSection[] = [
  {
    id: 'analytics',
    titleKey: 'admin.groups.analytics',
    accent: 'rgb(var(--color-success-400))',
    gradient:
      'linear-gradient(135deg, rgb(var(--color-success-400)), rgb(var(--color-accent-500)))',
    items: [
      {
        name: 'admin.nav.dashboard',
        icon: 'bar-chart',
        to: '/admin/dashboard',
        permission: 'stats:read',
      },
      {
        name: 'admin.nav.payments',
        icon: 'credit-card',
        to: '/admin/payments',
        permission: 'payments:read',
      },
      {
        name: 'admin.nav.trafficUsage',
        icon: 'activity',
        to: '/admin/traffic-usage',
        permission: 'traffic:read',
      },
      {
        name: 'admin.nav.salesStats',
        icon: 'trending',
        to: '/admin/sales-stats',
        permission: 'sales_stats:read',
      },
    ],
  },
  {
    id: 'users',
    titleKey: 'admin.groups.users',
    accent: 'rgb(var(--color-accent-400))',
    gradient: 'linear-gradient(135deg, rgb(var(--color-accent-400)), rgb(var(--color-error-400)))',
    items: [
      { name: 'admin.nav.users', icon: 'users', to: '/admin/users', permission: 'users:read' },
      {
        name: 'admin.nav.bulkActions',
        icon: 'list-checks',
        to: '/admin/bulk-actions',
        permission: 'bulk_actions:read',
      },
      {
        name: 'admin.nav.tickets',
        icon: 'ticket',
        to: '/admin/tickets',
        permission: 'tickets:read',
      },
      {
        name: 'admin.nav.banSystem',
        icon: 'shield-alert',
        to: '/admin/ban-system',
        permission: 'ban_system:read',
      },
    ],
  },
  {
    id: 'tariffs',
    titleKey: 'admin.groups.tariffs',
    accent: 'rgb(var(--color-warning-400))',
    gradient: 'linear-gradient(135deg, rgb(var(--color-warning-400)), rgb(var(--color-error-300)))',
    items: [
      { name: 'admin.nav.tariffs', icon: 'tag', to: '/admin/tariffs', permission: 'tariffs:read' },
      {
        name: 'admin.nav.promocodes',
        icon: 'gift',
        to: '/admin/promocodes',
        permission: 'promocodes:read',
      },
      {
        name: 'admin.nav.coupons',
        icon: 'ticket',
        to: '/admin/coupons',
        permission: 'coupons:read',
      },
      {
        name: 'admin.nav.promoGroups',
        icon: 'percent',
        to: '/admin/promo-groups',
        permission: 'promo_groups:read',
      },
      {
        name: 'admin.nav.promoOffers',
        icon: 'sparkle',
        to: '/admin/promo-offers',
        permission: 'promo_offers:read',
      },
      {
        name: 'admin.nav.paymentMethods',
        icon: 'wallet',
        to: '/admin/payment-methods',
        permission: 'payment_methods:read',
      },
      {
        name: 'admin.nav.landings',
        icon: 'layout',
        to: '/admin/landings',
        permission: 'landings:read',
      },
    ],
  },
  {
    id: 'marketing',
    titleKey: 'admin.groups.marketing',
    accent: 'rgb(var(--color-accent-300))',
    gradient: 'linear-gradient(135deg, rgb(var(--color-accent-300)), rgb(var(--color-accent-600)))',
    items: [
      { name: 'admin.nav.news', icon: 'newspaper', to: '/admin/news', permission: 'news:read' },
      {
        name: 'admin.nav.campaigns',
        icon: 'megaphone',
        to: '/admin/campaigns',
        permission: 'campaigns:read',
      },
      {
        name: 'admin.nav.broadcasts',
        icon: 'send',
        to: '/admin/broadcasts',
        permission: 'broadcasts:read',
      },
      {
        name: 'admin.nav.pinnedMessages',
        icon: 'pin',
        to: '/admin/pinned-messages',
        permission: 'pinned_messages:read',
      },
      {
        name: 'admin.nav.reminders',
        icon: 'bell',
        to: '/admin/reminders',
        permission: 'user_reminders:read',
      },
      { name: 'admin.nav.wheel', icon: 'circle-dot', to: '/admin/wheel', permission: 'wheel:read' },
      {
        name: 'admin.nav.partners',
        icon: 'handshake',
        to: '/admin/partners',
        permission: 'partners:read',
      },
      {
        // Раньше страница уровней открывалась только из Партнёры → Настройки, и
        // включив многоуровневую схему, админ не находил её в меню вовсе.
        // Пункт показывается всегда, а не при включённой схеме: саму схему
        // переключают с этой же страницы, и условный пункт замкнул бы круг.
        name: 'admin.nav.referralLevels',
        icon: 'trending',
        to: '/admin/partners/referral-levels',
        // Совпадает с правом, которое требуют и маршрут, и все эндпоинты уровней.
        permission: 'partners:settings',
      },
      {
        name: 'admin.nav.withdrawals',
        icon: 'arrow-up',
        to: '/admin/withdrawals',
        permission: 'withdrawals:read',
      },
      {
        name: 'admin.nav.referralNetwork',
        icon: 'network',
        to: '/admin/referral-network',
        permission: 'stats:read',
      },
    ],
  },
  {
    id: 'system',
    titleKey: 'admin.groups.system',
    accent: 'rgb(var(--color-accent-500))',
    gradient:
      'linear-gradient(135deg, rgb(var(--color-accent-500)), rgb(var(--color-success-500)))',
    items: [
      {
        name: 'admin.nav.channelSubscriptions',
        icon: 'radio',
        to: '/admin/channel-subscriptions',
        permission: 'channels:read',
      },
      {
        name: 'admin.nav.settings',
        icon: 'settings',
        to: '/admin/settings',
        permission: 'settings:read',
      },
      {
        // Настройки grace-доступа существуют и на общей странице настроек — там это
        // двенадцать несвязанных строк. Тут они собраны вместе с проверкой конфигурации
        // и состоянием сессий, поэтому и пункт меню отдельный.
        name: 'admin.nav.graceAccess',
        icon: 'lifebuoy',
        to: '/admin/grace-access',
        // То же право, что у страницы настроек и у эндпоинтов раздела.
        permission: 'settings:read',
      },
      { name: 'admin.nav.apps', icon: 'app', to: '/admin/apps', permission: 'apps:read' },
      {
        name: 'admin.nav.servers',
        icon: 'server',
        to: '/admin/servers',
        permission: 'servers:read',
      },
      {
        name: 'admin.nav.remnawave',
        icon: 'remnawave',
        to: '/admin/remnawave',
        permission: 'remnawave:read',
      },
      {
        name: 'admin.nav.reachability',
        icon: 'radar',
        to: '/admin/reachability',
        permission: 'reachability:read',
      },
      {
        name: 'admin.nav.dpichecker',
        icon: 'wall',
        to: '/admin/dpichecker',
        permission: 'dpichecker:read',
      },
      {
        name: 'admin.nav.emailTemplates',
        icon: 'mail',
        to: '/admin/email-templates',
        permission: 'email_templates:read',
      },
      {
        name: 'admin.nav.infoPages',
        icon: 'file-text',
        to: '/admin/info-pages',
        permission: 'info_pages:read',
      },
      {
        name: 'admin.nav.legalPages',
        icon: 'file-text',
        to: '/admin/legal-pages',
        permission: 'info_pages:read',
      },
      {
        name: 'admin.nav.updates',
        icon: 'refresh',
        to: '/admin/updates',
        permission: 'updates:read',
      },
    ],
  },
  {
    id: 'security',
    titleKey: 'admin.groups.security',
    accent: 'rgb(var(--color-error-400))',
    gradient: 'linear-gradient(135deg, rgb(var(--color-error-400)), rgb(var(--color-accent-600)))',
    items: [
      { name: 'admin.nav.roles', icon: 'shield', to: '/admin/roles', permission: 'roles:read' },
      {
        name: 'admin.nav.roleAssign',
        icon: 'user-check',
        to: '/admin/roles/assign',
        permission: 'roles:assign',
      },
      { name: 'admin.nav.policies', icon: 'lock', to: '/admin/policies', permission: 'roles:read' },
      {
        name: 'admin.nav.auditLog',
        icon: 'scroll',
        to: '/admin/audit-log',
        permission: 'audit_log:read',
      },
      {
        name: 'admin.nav.systemErrors',
        icon: 'shield',
        to: '/admin/system-errors',
        permission: 'system_errors:read',
      },
    ],
  },
];
