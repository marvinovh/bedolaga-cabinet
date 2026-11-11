/** Иконки макета RichVPN (обводка 2px, 24×24) — то, чего нет в общем наборе. */
interface P {
  className?: string;
}
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
export const RvCardIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);
export const RvGiftIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </svg>
);
export const RvShieldIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
  </svg>
);
export const RvMonitorIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);
export const RvChatIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4V5z" />
  </svg>
);
export const RvPhoneIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </svg>
);
export const RvCheckIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.5}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const RvPlusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const RvMinusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
  </svg>
);
export const RvBarsIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 20V10M10 20V4M15 20v-7M20 20v-4M3 20h18" />
  </svg>
);
export const RvGlobeIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.8 2.5 15.2 0 18M12 3c-2.5 2.8-2.5 15.2 0 18" />
  </svg>
);
export const RvBoltIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />
  </svg>
);
export const RvCopyIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);
export const RvQrIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
  </svg>
);
export const RvRefreshIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </svg>
);
