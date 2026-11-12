import { Trans } from 'react-i18next';
import { useEffect, useRef, useState, memo } from 'react';
import type { WheelPrize } from '../../api/wheel';

const SIZE = 400;
const CENTER = SIZE / 2;
const SPIN_DURATION_MS = 5000;
/** Пять полных оборотов до целевого сектора. */
const SPIN_EXTRA_TURNS_DEG = 1800;

// Та же кривая, что раньше стояла в CSS-переходе: cubic-bezier(0.15, 0.6, 0.1, 1).
const [EASE_X1, EASE_Y1, EASE_X2, EASE_Y2] = [0.15, 0.6, 0.1, 1];

function bezierAxis(a1: number, a2: number, t: number): number {
  return (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1) * t;
}

function bezierSlope(a1: number, a2: number, t: number): number {
  return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
}

/** Доля пути по времени 0..1 → доля поворота 0..1. */
export function spinEasing(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const slope = bezierSlope(EASE_X1, EASE_X2, t);
    if (slope === 0) break;
    t -= (bezierAxis(EASE_X1, EASE_X2, t) - x) / slope;
  }
  return bezierAxis(EASE_Y1, EASE_Y2, Math.min(1, Math.max(0, t)));
}

function rotateAttr(angle: number): string {
  return `rotate(${angle} ${CENTER} ${CENTER})`;
}

interface FortuneWheelProps {
  prizes: WheelPrize[];
  isSpinning: boolean;
  targetRotation: number | null;
  onSpinComplete: () => void;
}

const FortuneWheel = memo(function FortuneWheel({
  prizes,
  isSpinning,
  targetRotation,
  onSpinComplete,
}: FortuneWheelProps) {
  const wheelRef = useRef<SVGGElement>(null);
  const accumulatedRotation = useRef(0);
  // Угол покоя: пока идёт спин, React рисует прежний угол и в DOM не лезет,
  // атрибут ведёт кадр за кадром сам спин; по его концу угол покоя догоняет.
  const [restAngle, setRestAngle] = useState(0);
  const latestOnComplete = useRef(onSpinComplete);
  latestOnComplete.current = onSpinComplete;

  useEffect(() => {
    if (!isSpinning || targetRotation === null) return;
    const group = wheelRef.current;
    if (!group) return;
    const from = accumulatedRotation.current;
    let delta = targetRotation - (from % 360);
    while (delta < 0) delta += 360;
    const to = from + SPIN_EXTRA_TURNS_DEG + delta;
    accumulatedRotation.current = to;

    // Крутим SVG-атрибутом по requestAnimationFrame, а не CSS-transform с переходом:
    // CSS-transform на <g> заводит отдельный композитный слой, и Android WebView на
    // части устройств (Xiaomi 12, 17.09.2026) рисует его плитки чёрными квадратами
    // поверх секторов. Атрибут рисуется вместе со всем SVG — компоновать нечего.
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / SPIN_DURATION_MS);
      group.setAttribute('transform', rotateAttr(from + (to - from) * spinEasing(progress)));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      setRestAngle(to);
      latestOnComplete.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isSpinning, targetRotation]);

  if (prizes.length === 0) {
    return (
      <div className="mx-auto flex aspect-square w-full max-w-md items-center justify-center">
        <p className="text-dark-400">
          <Trans i18nKey="wheel.noPrizesConfigured" />
        </p>
      </div>
    );
  }

  const size = SIZE;
  const center = CENTER;
  const outerRadius = size / 2 - 20;
  const innerRadius = outerRadius - 15;
  const prizeRadius = innerRadius - 5;
  const sectorAngle = 360 / prizes.length;
  const hubRadius = 45;

  const createSectorPath = (index: number) => {
    const startAngle = (index * sectorAngle - 90) * (Math.PI / 180);
    const endAngle = ((index + 1) * sectorAngle - 90) * (Math.PI / 180);

    const x1 = center + prizeRadius * Math.cos(startAngle);
    const y1 = center + prizeRadius * Math.sin(startAngle);
    const x2 = center + prizeRadius * Math.cos(endAngle);
    const y2 = center + prizeRadius * Math.sin(endAngle);

    const x1Inner = center + hubRadius * Math.cos(startAngle);
    const y1Inner = center + hubRadius * Math.sin(startAngle);
    const x2Inner = center + hubRadius * Math.cos(endAngle);
    const y2Inner = center + hubRadius * Math.sin(endAngle);

    const largeArc = sectorAngle > 180 ? 1 : 0;

    return `M ${x1Inner} ${y1Inner}
            L ${x1} ${y1}
            A ${prizeRadius} ${prizeRadius} 0 ${largeArc} 1 ${x2} ${y2}
            L ${x2Inner} ${y2Inner}
            A ${hubRadius} ${hubRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`;
  };

  // RichVPN (макет «14 · Колесо удачи»): сектора чередуются лайм / чернила,
  // подпись приза — Bebas по радиусу; обод лаймовый, центр чёрный.
  const ACC = 'rgb(var(--color-accent-500))';
  const sectorFill = (index: number) => (index % 2 === 0 ? ACC : '#111111');
  const sectorText = (index: number) => (index % 2 === 0 ? '#111111' : ACC);
  const labelOf = (prize: (typeof prizes)[number]) => {
    const name = (prize.display_name || '').trim();
    return name.length > 12 ? `${name.slice(0, 11)}…` : name || prize.emoji;
  };

  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none">
      {/* Указатель */}
      <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2">
        <svg width="34" height="38" viewBox="0 0 34 38" aria-hidden="true">
          <polygon
            points="17,36 2,4 32,4"
            fill="#F2F0E8"
            stroke="#111"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="relative aspect-square">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          {/* Подложка и обод */}
          <circle cx={center} cy={center} r={outerRadius + 4} fill={ACC} />
          <circle cx={center} cy={center} r={outerRadius - 4} fill="#111111" />

          <g ref={wheelRef} transform={rotateAttr(restAngle)}>
            {prizes.map((prize, index) => (
              <path
                key={`sector-${prize.id}`}
                d={createSectorPath(index)}
                fill={sectorFill(index)}
                stroke="#111111"
                strokeWidth="3"
              />
            ))}
            {prizes.map((prize, index) => {
              const angleDeg = index * sectorAngle + sectorAngle / 2;
              const rad = (angleDeg - 90) * (Math.PI / 180);
              const r = (prizeRadius + hubRadius) / 2 + 6;
              const x = center + r * Math.cos(rad);
              const y = center + r * Math.sin(rad);
              return (
                <text
                  key={`label-${prize.id}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Bebas Neue, Impact, sans-serif"
                  fontSize={prizes.length <= 6 ? 30 : prizes.length <= 8 ? 26 : 21}
                  fill={sectorText(index)}
                  transform={`rotate(${angleDeg - 90}, ${x}, ${y})`}
                >
                  {labelOf(prize)}
                </text>
              );
            })}
          </g>

          {/* Центр */}
          <circle
            cx={center}
            cy={center}
            r={hubRadius - 6}
            fill="#111111"
            stroke={ACC}
            strokeWidth="6"
          />
          <polygon
            points={`${center},${center - 11} ${center - 10},${center + 8} ${center + 10},${center + 8}`}
            fill={ACC}
            className={isSpinning ? 'animate-pulse' : undefined}
          />
        </svg>
      </div>
    </div>
  );
});

export default FortuneWheel;
