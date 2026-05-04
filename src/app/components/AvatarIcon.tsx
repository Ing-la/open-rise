'use client';

export const AVATARS = [
  { id: 'cat',     color: '#FF5C5C' },
  { id: 'ghost',   color: '#00D4FF' },
  { id: 'crown',   color: '#FBBC05' },
  { id: 'robot',   color: '#EC4899' },
  { id: 'excited', color: '#FF6B35' },
  { id: 'lazy',    color: '#7C3AED' },
  { id: 'cool',    color: '#3B82F6' },
  { id: 'cute',    color: '#F472B6' },
] as const;

/* ── Reusable animation keyframes ── */
const ANIM_STYLE = `
@keyframes blink-s { 0%,92%,100%{transform:scaleY(1)} 94%{transform:scaleY(0.12)} }
@keyframes blink-f { 0%,96%,100%{transform:scaleY(1)} 97.5%{transform:scaleY(0.12)} }
@keyframes wave-r { 0%,86%,100%{transform:rotate(0deg)} 88%{transform:rotate(-18deg)} 92%{transform:rotate(14deg)} 94%{transform:rotate(-10deg)} }
@keyframes wave-l { 0%,86%,100%{transform:rotate(0deg)} 88%{transform:rotate(18deg)} 92%{transform:rotate(-14deg)} 94%{transform:rotate(10deg)} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes bounce { 0%,100%{transform:translateY(0)} 20%{transform:translateY(-6px)} 40%{transform:translateY(0)} }
@keyframes sway { 0%,100%{transform:rotate(0)} 25%{transform:rotate(4deg)} 75%{transform:rotate(-4deg)} }
@keyframes droop { 0%,60%,100%{transform:translateY(0)} 20%{transform:translateY(4px)} }
@keyframes nod { 0%,96%,100%{transform:rotate(0)} 97.5%{transform:rotate(3deg)} 98.5%{transform:rotate(-2deg)} }
@keyframes fade-blink { 0%,92%,100%{opacity:1} 94%{opacity:0} 96%{opacity:1} }
@keyframes antenna-glow { 0%,100%{opacity:0.3} 50%{opacity:1} }
`;

function SvgFrame({ children, size }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size ?? 56} height={size ?? 56} fill="none" aria-hidden="true">
      <style>{ANIM_STYLE}</style>
      {children}
    </svg>
  );
}

export function AvatarIcon({ id, size }: { id: string; size?: number }) {
  const s = size ?? 56;
  const c = AVATARS.find((a) => a.id === id)?.color ?? '#2C2C2C';
  const p = { stroke: c, strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, filter: 'url(#tremble)' };
  const f = { fill: 'none', ...p };
  const dot = (x: number, y: number, cls?: string) => <circle key={`d${x}`} cx={x} cy={y} r={2.5} fill={c} filter="url(#tremble)" className={cls} />;

  switch (id) {
    /* ════════════════════════════════
       Cat — playful, blinking
       ════════════════════════════════ */
    case 'cat':
      return (
        <SvgFrame size={s}>
          <path d="M 18 26 L 10 6 L 28 20" {...f} />
          <path d="M 46 26 L 54 6 L 36 20" {...f} />
          <circle cx="32" cy="34" r="16" {...f} />
          <g className="blink-s" style={{ transformOrigin: '50% 45%' }}>
            <circle cx="24" cy="32" r="2.5" fill={c} filter="url(#tremble)" />
            <circle cx="40" cy="32" r="2.5" fill={c} filter="url(#tremble)" />
          </g>
          {[2, 16, 30].map((i) => (
            <g key={`w${i}`}>
              <line x1={i} y1={34} x2={18} y2={36} {...f} strokeWidth={1.5} />
              <line x1={62 - i} y1={34} x2={46} y2={36} {...f} strokeWidth={1.5} />
            </g>
          ))}
        </SvgFrame>
      );

    /* ════════════════════════════════
       Ghost — mischievous, floating + blink
       ════════════════════════════════ */
    case 'ghost':
      return (
        <SvgFrame size={s}>
          <g className="float" style={{ transformOrigin: '50% 50%' }}>
            <path d="M 16 24 C 16 8, 48 8, 48 24 L 48 48 C 48 54, 40 54, 38 48 L 36 40 C 34 36, 30 36, 28 40 L 26 48 C 24 54, 16 54, 16 48 Z" {...f} />
            <g className="blink-s" style={{ transformOrigin: '50% 45%' }}>
              <circle cx="24" cy="28" r="2.5" fill={c} filter="url(#tremble)" />
              <circle cx="40" cy="28" r="2.5" fill={c} filter="url(#tremble)" />
            </g>
            <path d="M 28 36 Q 32 40 36 36" {...f} strokeWidth={2} />
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Crown — regal, nodding
       ════════════════════════════════ */
    case 'crown':
      return (
        <SvgFrame size={s}>
          <g className="nod" style={{ transformOrigin: '50% 50%' }}>
            <path d="M 8 48 L 8 30 L 20 38 L 32 22 L 44 38 L 56 30 L 56 48 Z" {...f} />
            <line x1="8" y1="50" x2="56" y2="50" {...f} strokeWidth={2} />
            <g className="blink-f" style={{ transformOrigin: '50% 40%' }}>
              <circle cx="18" cy="44" r="2.5" fill={c} filter="url(#tremble)" />
              <circle cx="32" cy="40" r="2.5" fill={c} filter="url(#tremble)" />
              <circle cx="46" cy="44" r="2.5" fill={c} filter="url(#tremble)" />
            </g>
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Robot — mechanical, antenna glow + blink
       ════════════════════════════════ */
    case 'robot':
      return (
        <SvgFrame size={s}>
          <rect x="16" y="20" width="32" height="28" rx="4" {...f} />
          <line x1="32" y1="8" x2="32" y2="20" {...f} strokeWidth={2} />
          <circle cx="32" cy="6" r="3" {...f} strokeWidth={2} className="antenna-glow" />
          <g className="blink-s" style={{ transformOrigin: '50% 50%' }}>
            <circle cx="24" cy="32" r="2.5" fill={c} filter="url(#tremble)" />
            <circle cx="40" cy="32" r="2.5" fill={c} filter="url(#tremble)" />
          </g>
          <line x1="24" y1="42" x2="40" y2="42" {...f} />
          <line x1="12" y1="28" x2="16" y2="30" {...f} strokeWidth={2} />
          <line x1="52" y1="28" x2="48" y2="30" {...f} strokeWidth={2} />
        </SvgFrame>
      );

    /* ════════════════════════════════
       Excited (亢奋) — orange, bouncing, zigzag energy
       ════════════════════════════════ */
    case 'excited':
      return (
        <SvgFrame size={s}>
          <g className="bounce" style={{ transformOrigin: '50% 50%' }}>
            {/* Scribble body — multiple overlapping paths */}
            <path d="M 20 16 C 38 8, 56 18, 52 34 C 48 50, 28 54, 16 44 C 4 34, 8 22, 20 16" {...f} />
            <path d="M 18 20 C 32 10, 48 16, 48 32 C 48 46, 32 52, 20 44 C 10 36, 12 24, 18 20" {...f} strokeWidth={1.5} opacity="0.5" />
            <path d="M 24 14 C 40 8, 50 22, 50 34 C 50 48, 36 52, 24 46 C 14 40, 16 22, 24 14" {...f} strokeWidth={1} opacity="0.3" />
            {/* Energy zigzags around body */}
            <path d="M 8 12 L 14 8 L 10 4 M 54 10 L 58 16 L 62 10 M 56 46 L 60 50 L 56 56 M 6 42 L 2 46 L 6 50" {...f} strokeWidth={1.5} opacity="0.6" />
            {/* Big excited eyes */}
            <g className="blink-f" style={{ transformOrigin: '50% 45%' }}>
              <circle cx="24" cy="30" r="4.5" fill="none" {...p} />
              <circle cx="40" cy="30" r="4.5" fill="none" {...p} />
              <circle cx="24" cy="30" r="2" fill={c} filter="url(#tremble)" />
              <circle cx="40" cy="30" r="2" fill={c} filter="url(#tremble)" />
              {/* Sparkle */}
              <circle cx="22" cy="28" r="1" fill={c} filter="url(#tremble)" opacity="0.6" />
              <circle cx="38" cy="28" r="1" fill={c} filter="url(#tremble)" opacity="0.6" />
            </g>
            {/* Big smile */}
            <path d="M 24 40 Q 32 48 40 40" {...f} strokeWidth={2.5} />
            {/* Waving arms */}
            <g className="wave-r" style={{ transformOrigin: '48px 36px' }}>
              <path d="M 50 36 C 56 30, 58 22, 54 18" {...f} strokeWidth={2.5} />
            </g>
            <path d="M 14 36 L 10 26 L 6 24" {...f} strokeWidth={2.5} />
            {/* Legs */}
            <path d="M 22 50 L 18 58 M 38 50 L 42 58" {...f} strokeWidth={2.5} />
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Lazy (懒惰) — purple, droopy, half-asleep
       ════════════════════════════════ */
    case 'lazy':
      return (
        <SvgFrame size={s}>
          <g className="droop" style={{ transformOrigin: '50% 50%' }}>
            {/* Saggy scribble body */}
            <path d="M 16 18 C 30 6, 50 12, 52 30 C 54 46, 42 54, 28 54 C 14 54, 6 44, 10 28 C 12 18, 14 20, 16 18" {...f} />
            <path d="M 14 22 C 26 10, 46 14, 48 30 C 50 44, 40 52, 28 52 C 16 52, 8 42, 12 28" {...f} strokeWidth={1.5} opacity="0.4" />
            {/* Droopy sleep eyes */}
            <g className="blink-s" style={{ transformOrigin: '50% 45%', animationDuration: '14s' }}>
              <path d="M 20 30 Q 24 34 28 30" {...f} strokeWidth={2.5} />
              <path d="M 36 30 Q 40 34 44 30" {...f} strokeWidth={2.5} />
            </g>
            {/* Yawn mouth */}
            <ellipse cx="32" cy="42" rx="4" ry="5" {...f} strokeWidth={2} />
            {/* Limp arms */}
            <path d="M 14 34 C 8 40, 6 48, 10 52" {...f} strokeWidth={2.5} />
            <path d="M 50 34 C 56 40, 58 48, 54 52" {...f} strokeWidth={2.5} />
            {/* Sagging legs */}
            <path d="M 20 52 Q 16 58 14 58 M 38 52 Q 42 58 44 58" {...f} strokeWidth={2.5} />
            {/* Zzz */}
            <text x="48" y="18" fill={c} fontSize="10" fontFamily="monospace" opacity="0.5" filter="url(#tremble)">z</text>
            <text x="52" y="10" fill={c} fontSize="8" fontFamily="monospace" opacity="0.3" filter="url(#tremble)">z</text>
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Cool (冷酷) — blue, angular, aloof
       ════════════════════════════════ */
    case 'cool':
      return (
        <SvgFrame size={s}>
          <g className="nod" style={{ transformOrigin: '50% 50%' }}>
            {/* Angular scribble body */}
            <path d="M 16 16 L 48 12 L 54 28 L 52 44 L 40 54 L 24 54 L 10 44 L 8 28 Z" {...f} />
            <path d="M 18 20 L 44 16 L 50 30 L 48 42 L 38 50 L 26 50 L 14 42 L 12 30 Z" {...f} strokeWidth={1.5} opacity="0.4" />
            {/* Cool half-lidded eyes */}
            <g>
              <path d="M 18 30 L 26 30 M 38 30 L 46 30" {...f} strokeWidth={2.5} />
              <circle cx="22" cy="30" r="2" fill={c} filter="url(#tremble)" />
              <circle cx="42" cy="30" r="2" fill={c} filter="url(#tremble)" />
            </g>
            {/* Smirk */}
            <path d="M 28 42 Q 36 46 42 40" {...f} strokeWidth={2.5} />
            {/* Arms crossed */}
            <path d="M 12 36 L 20 44 L 14 50" {...f} strokeWidth={2.5} />
            <path d="M 52 36 L 44 44 L 50 50" {...f} strokeWidth={2.5} />
            {/* Legs */}
            <path d="M 20 52 L 16 58 M 44 52 L 48 58" {...f} strokeWidth={2.5} />
            {/* Cool hair tuft */}
            <path d="M 28 12 L 32 4 L 36 10 M 24 14 L 20 6 L 28 12" {...f} strokeWidth={2} />
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Cute (可爱) — pink, round, sweet
       ════════════════════════════════ */
    case 'cute':
      return (
        <SvgFrame size={s}>
          <g className="sway" style={{ transformOrigin: '50% 50%' }}>
            {/* Round soft scribble body */}
            <path d="M 20 14 C 40 6, 56 18, 52 34 C 48 50, 32 56, 20 50 C 8 44, 6 24, 20 14" {...f} />
            <path d="M 22 18 C 38 10, 52 20, 48 34 C 44 46, 32 50, 22 46 C 12 42, 10 26, 22 18" {...f} strokeWidth={1.5} opacity="0.4" />
            {/* Big sparkly eyes */}
            <g className="blink-s" style={{ transformOrigin: '50% 45%' }}>
              <circle cx="24" cy="30" r="5" fill="none" {...p} />
              <circle cx="40" cy="30" r="5" fill="none" {...p} />
              <circle cx="24" cy="30" r="2.5" fill={c} filter="url(#tremble)" />
              <circle cx="40" cy="30" r="2.5" fill={c} filter="url(#tremble)" />
              <circle cx="22" cy="28" r="1.2" fill={c} filter="url(#tremble)" opacity="0.7" />
              <circle cx="38" cy="28" r="1.2" fill={c} filter="url(#tremble)" opacity="0.7" />
            </g>
            {/* Heart mouth */}
            <path d="M 28 40 C 28 36, 36 36, 36 40 C 36 44, 28 46, 28 44 C 28 46, 20 44, 20 40 C 20 36, 28 36, 28 40 Z" {...f} fill={c} opacity="0.3" strokeWidth={2} />
            {/* Blush */}
            <circle cx="16" cy="36" r="4" fill={c} opacity="0.12" filter="url(#tremble)" />
            <circle cx="48" cy="36" r="4" fill={c} opacity="0.12" filter="url(#tremble)" />
            {/* Clasped arms */}
            <g className="wave-l" style={{ transformOrigin: '20px 38px' }}>
              <path d="M 14 36 C 8 40, 10 48, 16 44" {...f} strokeWidth={2.5} />
            </g>
            <g className="wave-r" style={{ transformOrigin: '44px 38px' }}>
              <path d="M 50 36 C 56 40, 54 48, 48 44" {...f} strokeWidth={2.5} />
            </g>
            {/* Legs */}
            <path d="M 22 48 L 20 58 M 38 48 L 40 58" {...f} strokeWidth={2.5} />
            {/* Hair ribbon */}
            <path d="M 32 12 L 38 8 M 32 12 L 26 8" {...f} strokeWidth={2} />
          </g>
        </SvgFrame>
      );

    /* ════════════════════════════════
       Fallback
       ════════════════════════════════ */
    default:
      return (
        <SvgFrame size={s}>
          <circle cx="32" cy="32" r="28" {...f} strokeDasharray="4 3" />
          <text x="32" y="40" textAnchor="middle" fill={c} fontSize="28" filter="url(#tremble)">?</text>
        </SvgFrame>
      );
  }
}
