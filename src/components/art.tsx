import { AnimatePresence, motion } from 'framer-motion'
import { useId, type KeyboardEvent, type ReactNode } from 'react'
import type { Signal, SignalId } from '../lib/analysis'
import { LEVEL_STYLE } from '../lib/levels'

// Calm illustrations that double as diagrams: the mind-weather sky, the six
// signals as a lotus, the support ladder as stepping stones, a breathing clock
// and leaves on a stream. Drawn in code so they follow every theme, and they
// move at the pace of a slow breath.

export type Tod = 'dawn' | 'day' | 'dusk' | 'night'
export const timeOfDay = (h = new Date().getHours()): Tod => (h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night')

const SKY: Record<Tod, [string, string, string]> = {
  dawn: ['#c6cbe8', '#f2d0c0', '#f8e5c4'],
  day: ['#a7c9e4', '#d3e5f0', '#f3eee1'],
  dusk: ['#9aa0d2', '#e0b0b3', '#f2cd9e'],
  night: ['#111734', '#222b5c', '#3a3f78'],
}
const HILL: Record<Tod, [string, string, string]> = {
  dawn: ['#cdc8de', '#a8b9a3', '#86a07e'],
  day: ['#bcd0b7', '#9cb994', '#7e9c77'],
  dusk: ['#c6adbc', '#a2a599', '#7d8e77'],
  night: ['#2a3266', '#212856', '#171d42'],
}
const CLOUD: Record<Tod, string> = { dawn: '#fff6f0', day: '#ffffff', dusk: '#f7e6ea', night: '#4a5290' }

/** Smooth rolling hill across the width. */
const hill = (W: number, H: number, y: number, amp: number, ph: number) => {
  const pts = Array.from({ length: 5 }, (_, i) => [(i / 4) * W, y + Math.sin(i * 1.7 + ph) * amp])
  let d = `M0 ${H} L0 ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const cx = ((x0 + x1) / 2).toFixed(1)
    d += ` C${cx} ${y0.toFixed(1)} ${cx} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return `${d} L${W} ${H} Z`
}

function Cloud({ x, y, s, fill, opacity, time }: { x: number; y: number; s: number; fill: string; opacity: number; time: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="drift" style={{ ['--drift-time' as string]: `${time}s`, ['--drift-from' as string]: '-10px', ['--drift-to' as string]: '12px' }} fill={fill} opacity={opacity}>
        <ellipse cx="0" cy="0" rx="26" ry="10" />
        <circle cx="-10" cy="-6" r="10" />
        <circle cx="6" cy="-10" r="13" />
        <circle cx="19" cy="-3" r="8" />
      </g>
    </g>
  )
}

export interface SkyWeather { score: number; name: string }

/**
 * The student's mind weather as a view out of a window: clear, a few clouds,
 * overcast, or soft rain. Time of day sets dawn, day, dusk or night.
 * variant "arch" is a jharokha window; "banner" is a wide landscape.
 */
export function SkyScene({ variant = 'arch', weather, tod = timeOfDay(), className = '', children }: { variant?: 'arch' | 'banner'; weather: SkyWeather; tod?: Tod; className?: string; children?: ReactNode }) {
  const id = useId().replace(/:/g, '')
  const arch = variant === 'arch'
  const W = arch ? 240 : 360
  const H = arch ? 300 : 180
  const learning = weather.name.startsWith('Getting')
  const clouds = learning ? 1 : weather.score <= 1 ? 1 : weather.score <= 3 ? 2 : weather.score <= 5 ? 3 : 4
  const rain = !learning && weather.score >= 6
  const grey = weather.score >= 4 && !learning
  const night = tod === 'night'
  const [s0, s1, s2] = SKY[tod]
  const [h0, h1, h2] = HILL[tod]
  const sun = { dawn: [0.2, 0.5], day: [0.8, 0.22], dusk: [0.82, 0.48], night: [0.78, 0.2] }[tod]
  const sx = sun[0] * W
  const sy = sun[1] * H
  const sunR = H * (night ? 0.055 : 0.07)
  const framePath = arch ? `M0 ${H} V110 C0 52 52 14 120 0 C188 14 240 52 240 110 V${H} Z` : `M0 0 H${W} V${H} H0 Z`
  const cloudSlots: [number, number, number, number][] = arch
    ? [[0.24, 0.26, 1, 34], [0.74, 0.36, 0.85, 40], [0.5, 0.15, 1.1, 30], [0.3, 0.44, 0.9, 46]]
    : [[0.2, 0.22, 1.1, 34], [0.62, 0.16, 0.9, 40], [0.44, 0.34, 1.2, 30], [0.86, 0.36, 0.95, 46]]
  const cloudFill = grey ? (night ? '#3b4174' : '#e3e1ea') : CLOUD[tod]
  const stars = night ? Array.from({ length: 26 }, (_, i) => [((i * 67) % 97) / 97, ((i * 41) % 53) / 53 * 0.55, 0.6 + (i % 3) * 0.35, (i % 7) * 0.6]) : []
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={s0} />
          <stop offset="0.55" stopColor={s1} />
          <stop offset="1" stopColor={s2} />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor={night ? '#f5f0da' : '#fff3c9'} stopOpacity="0.9" />
          <stop offset="1" stopColor={night ? '#f5f0da' : '#ffe6a8'} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-lake`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={s2} />
          <stop offset="1" stopColor={s1} />
        </linearGradient>
        <clipPath id={`${id}-clip`}><path d={framePath} /></clipPath>
        <mask id={`${id}-moon`}>
          <circle cx={sx} cy={sy} r={sunR} fill="#fff" />
          <circle cx={sx + sunR * 0.55} cy={sy - sunR * 0.3} r={sunR * 0.92} fill="#000" />
        </mask>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={W} height={H} fill={`url(#${id}-sky)`} />
        {stars.map(([x, y, r, d], i) => (
          <circle key={i} cx={x * W} cy={y * H + 6} r={r} fill="#fff" className="twinkle" style={{ animationDelay: `${d}s` }} />
        ))}
        <circle cx={sx} cy={sy} r={sunR * 3.4} fill={`url(#${id}-sun)`} className="breathe-glow" style={{ ['--glow-lo' as string]: grey ? 0.25 : 0.55, ['--glow-hi' as string]: grey ? 0.5 : 1 }} />
        {night
          ? <circle cx={sx} cy={sy} r={sunR} fill="#f3eed8" mask={`url(#${id}-moon)`} />
          : <circle cx={sx} cy={sy} r={sunR} fill={tod === 'day' ? '#fde7a6' : '#f9cf94'} opacity={grey ? 0.75 : 1} />}
        {!night && !grey && (
          <g fill="none" stroke="#4b4a63" strokeWidth="1.2" strokeLinecap="round" opacity="0.55">
            <g className="drift" style={{ ['--drift-time' as string]: '18s', ['--drift-to' as string]: '18px' }}>
              <path d={`M${W * 0.38} ${H * 0.2} q4 -4 8 0 q4 -4 8 0`} />
              <path d={`M${W * 0.46} ${H * 0.26} q3 -3 6 0 q3 -3 6 0`} />
            </g>
          </g>
        )}
        {cloudSlots.slice(0, clouds).map(([x, y, s, t], i) => (
          <Cloud key={i} x={x * W} y={y * H} s={s * (arch ? 1 : 1.15)} fill={cloudFill} opacity={night ? 0.75 : 0.92} time={t} />
        ))}
        {rain && (
          <g stroke={night ? '#9fb0e8' : '#8ea3c2'} strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
            {Array.from({ length: 22 }, (_, i) => {
              const x = ((i * 53) % 100) / 100 * W
              const y = H * (0.3 + ((i * 29) % 30) / 100)
              return <line key={i} x1={x} y1={y} x2={x - 2} y2={y + 9} className="fall" style={{ animationDelay: `${(i % 7) * 0.4}s`, animationDuration: `${2.6 + (i % 4) * 0.5}s` }} />
            })}
          </g>
        )}
        <path d={hill(W, H, H * 0.64, H * 0.035, 0.4)} fill={h0} />
        <rect x="0" y={H * 0.72} width={W} height={H * 0.12} fill={`url(#${id}-lake)`} opacity="0.9" />
        <g stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity={night ? 0.25 : 0.55}>
          <line x1={sx - 16} x2={sx + 10} y1={H * 0.75} y2={H * 0.75} className="drift" style={{ ['--drift-time' as string]: '9s' }} />
          <line x1={sx - 8} x2={sx + 14} y1={H * 0.78} y2={H * 0.78} className="drift" style={{ ['--drift-time' as string]: '11s', ['--drift-from' as string]: '6px', ['--drift-to' as string]: '-6px' }} />
        </g>
        <path d={hill(W, H, H * 0.8, H * 0.03, 2.1)} fill={h1} />
        <g fill={h2}>
          <circle cx={W * 0.12} cy={H * 0.76} r={H * 0.035} />
          <rect x={W * 0.12 - 1} y={H * 0.76} width="2" height={H * 0.05} />
          <circle cx={W * 0.9} cy={H * 0.75} r={H * 0.03} />
          <rect x={W * 0.9 - 1} y={H * 0.75} width="2" height={H * 0.05} />
        </g>
        <path d={hill(W, H, H * 0.9, H * 0.025, 4.2)} fill={h2} />
        {learning && (
          <g fill="#fff" opacity="0.5">
            <ellipse cx={W * 0.4} cy={H * 0.7} rx={W * 0.5} ry="7" className="drift" style={{ ['--drift-time' as string]: '30s' }} />
            <ellipse cx={W * 0.6} cy={H * 0.62} rx={W * 0.4} ry="5" className="drift" style={{ ['--drift-time' as string]: '38s', ['--drift-from' as string]: '10px', ['--drift-to' as string]: '-10px' }} />
          </g>
        )}
        {children}
      </g>
      {arch && (
        <g fill="none" stroke="var(--ink)" strokeLinejoin="round">
          <path d={`M1 ${H} V110 C1 52 52 15 120 1 C188 15 239 52 239 110 V${H}`} strokeWidth="1.6" opacity="0.5" />
          <path d={`M8 ${H} V113 C8 58 57 22 120 9 C183 22 232 58 232 113 V${H}`} strokeWidth="0.8" opacity="0.28" />
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Six signals as a lotus                                              */
/* ------------------------------------------------------------------ */

const PETAL = 'M0 -16 C24 -34 30 -72 0 -100 C-30 -72 -24 -34 0 -16 Z'
const SMALL = 'M0 -12 C16 -26 20 -52 0 -70 C-20 -52 -16 -26 0 -12 Z'

export function SignalLotus({ signals, onPick, className = '' }: { signals: Signal[]; onPick?: (id: SignalId) => void; className?: string }) {
  const id = useId().replace(/:/g, '')
  const key = (e: KeyboardEvent, s: Signal) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(s.id) } }
  return (
    <svg viewBox="-172 -160 344 318" className={className} role="group" aria-label="Your six signals, drawn as a lotus">
      <defs>
        {(['steady', 'shifting', 'strained', 'unknown'] as const).map((l) => (
          <linearGradient key={l} id={`${id}-${l}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={`color-mix(in oklab, ${LEVEL_STYLE[l].color} 30%, var(--card))`} />
            <stop offset="1" stopColor={LEVEL_STYLE[l].color} stopOpacity={l === 'unknown' ? 0.4 : 0.95} />
          </linearGradient>
        ))}
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor="var(--haldi)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--haldi)" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <circle r="120" fill={`url(#${id}-halo)`} className="breathe-glow" />
      <g className="breathe" style={{ ['--breathe-to' as string]: 1.03 }}>
        {[30, 90, 150, 210, 270, 330].map((a, i) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d={SMALL} fill="var(--paper-2)" stroke="var(--line)" strokeWidth="1" className="petal" style={{ animationDelay: `${0.5 + i * 0.05}s` }} />
          </g>
        ))}
        {signals.map((s, i) => {
          return (
            <g key={s.id} transform={`rotate(${i * 60})`}>
              {s.level === 'strained' && <path d={PETAL} fill="var(--care)" filter={`url(#${id}-soft)`} className="breathe-glow" style={{ ['--glow-lo' as string]: 0.15, ['--glow-hi' as string]: 0.55 }} />}
              <path d={PETAL} fill={`url(#${id}-${s.level})`} stroke={s.level === 'unknown' ? 'var(--ink-faint)' : 'color-mix(in oklab, var(--ink) 30%, transparent)'} strokeWidth="1" strokeDasharray={s.level === 'unknown' ? '3 4' : undefined} className="petal" style={{ animationDelay: `${i * 0.08}s` }} />
              <path d="M0 -22 Q3 -58 0 -90" fill="none" stroke="var(--card)" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" className="petal" style={{ animationDelay: `${i * 0.08}s` }} />
            </g>
          )
        })}
        <circle r="15" fill="var(--haldi)" />
        {[[-5, -4], [4, -5], [0, 3], [6, 3], [-6, 4]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="color-mix(in oklab, var(--haldi) 50%, var(--ink))" />)}
      </g>
      {signals.map((s, i) => {
        const a = (i * 60 * Math.PI) / 180
        const R = 128
        const x = Math.sin(a) * R
        const y = -Math.cos(a) * R + (i === 0 ? -4 : i === 3 ? 6 : 0)
        const st = LEVEL_STYLE[s.level]
        return (
          <g key={s.id} role="button" tabIndex={0} aria-label={`${s.label}: ${st.label}. ${s.headline}`} onClick={() => onPick?.(s.id)} onKeyDown={(e) => key(e, s)} style={{ cursor: onPick ? 'pointer' : undefined, outline: 'none' }}>
            <rect x={x - 46} y={y - 18} width="92" height="36" rx="12" fill="transparent" />
            <text x={x} y={y - 2} textAnchor="middle" fontSize="13.5" fontWeight="700" fill="var(--ink)" fontFamily="Manrope, system-ui, sans-serif">{s.label}</text>
            <text x={x} y={y + 13} textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="1" fill={st.ink} fontFamily="Manrope, system-ui, sans-serif">{st.label.toUpperCase()}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Support ladder as stepping stones                                   */
/* ------------------------------------------------------------------ */

const STONES = ['Self-care', 'Reach out', 'Counsellor', 'Urgent help']

export function SupportPath({ rung, className = '' }: { rung: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const xs = [56, 130, 204, 278]
  return (
    <svg viewBox="0 0 334 136" className={className} role="img" aria-label={`Support ladder: four stepping stones. Suggested now: ${STONES[rung]}.`}>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="color-mix(in oklab, var(--sky) 45%, var(--card))" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--sky) 25%, var(--card))" />
        </linearGradient>
      </defs>
      <path d="M0 46 C60 38 110 54 170 46 S280 38 334 48 V98 C280 106 230 92 170 100 S60 106 0 96 Z" fill={`url(#${id}-water)`} />
      <g fill="none" stroke="var(--card)" strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
        <path d="M0 62 C60 56 110 68 170 62 S280 56 334 64" strokeDasharray="8 14" className="flow" />
        <path d="M0 84 C60 78 110 90 170 84 S280 78 334 86" strokeDasharray="5 16" className="flow" style={{ animationDuration: '19s' }} />
      </g>
      <path d="M0 40 Q10 46 0 104 Z" fill="var(--pista)" opacity="0.45" />
      <path d="M334 42 Q322 50 334 106 Z" fill="var(--pista)" opacity="0.45" />
      {xs.map((x, i) => {
        const y = 72 + (i % 2 ? -5 : 4)
        const on = i === rung
        return (
          <g key={i}>
            {on && <ellipse cx={x} cy={y} rx="40" ry="20" fill="var(--haldi)" className="breathe-glow" style={{ ['--glow-lo' as string]: 0.15, ['--glow-hi' as string]: 0.45 }} />}
            <ellipse cx={x} cy={y + 3} rx="30" ry="12" fill="color-mix(in oklab, var(--ink) 18%, transparent)" />
            <ellipse cx={x} cy={y} rx="30" ry="12.5" fill={on ? 'color-mix(in oklab, var(--haldi) 45%, var(--card))' : 'var(--paper-2)'} stroke={i === 3 ? 'var(--care)' : 'color-mix(in oklab, var(--ink) 25%, transparent)'} strokeWidth={i === 3 ? 1.4 : 1} />
            <ellipse cx={x - 7} cy={y - 4} rx="12" ry="3" fill="#fff" opacity="0.35" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontFamily="Fraunces, Georgia, serif" fill="var(--ink)">{i + 1}</text>
            <text x={x} y="126" textAnchor="middle" fontSize="11" fontWeight={on ? 700 : 500} fill={on ? 'var(--ink)' : 'var(--ink-soft)'} fontFamily="Manrope, system-ui, sans-serif">{STONES[i]}</text>
            {on && (
              <g transform={`translate(${x} ${y - 30})`}>
                <circle r="9" fill="var(--accent)" opacity="0.18" className="breathe" style={{ ['--breathe-to' as string]: 1.5 }} />
                <path d="M0 6 C-7 -1 -6 -9 0 -9 C6 -9 7 -1 0 6 Z" fill="var(--accent)" />
                <circle cy="-3.5" r="2.2" fill="var(--card)" />
              </g>
            )}
          </g>
        )
      })}
      <text x="4" y="30" fontSize="10" fontWeight="700" letterSpacing="1.2" fill="var(--ink-faint)" fontFamily="Manrope, system-ui, sans-serif">YOU</text>
      <text x="330" y="30" textAnchor="end" fontSize="10" fontWeight="700" letterSpacing="1.2" fill="var(--ink-faint)" fontFamily="Manrope, system-ui, sans-serif">MORE SUPPORT</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Breathing clock                                                     */
/* ------------------------------------------------------------------ */

const PHASE_COLOR: Record<string, string> = { 'Breathe in': '#9fd3b4', Hold: '#efcf7a', 'Breathe out': '#a9c3f0' }
const SHORT: Record<string, string> = { 'Breathe in': 'in', Hold: 'hold', 'Breathe out': 'out' }

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return [Math.sin(a) * r, -Math.cos(a) * r]
}
const arc = (a0: number, a1: number, r: number) => {
  const [x0, y0] = polar(a0, r)
  const [x1, y1] = polar(a1, r)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** One breath cycle as a ring; a light travels round it in real time. */
export function BreathClock({ phases, running, phase, className = '' }: { phases: readonly (readonly [string, number])[]; running: boolean; phase: number; className?: string }) {
  const total = phases.reduce((a, p) => a + p[1], 0)
  const n = phases.length
  const starts = phases.map((_, i) => (phases.slice(0, i).reduce((a, p) => a + p[1], 0) / total) * 360)
  const R = 104
  const idx = ((phase % n) + n) % n
  const end = Math.floor(phase / n) * 360 + starts[idx] + (phases[idx][1] / total) * 360
  return (
    <svg viewBox="-130 -130 260 260" className={className} aria-hidden>
      <circle r={R} fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="10" />
      {phases.map(([label, secs], i) => {
        const a0 = starts[i] + 2
        const a1 = starts[i] + (secs / total) * 360 - 2
        const [lx, ly] = polar((a0 + a1) / 2, R + 17)
        const lit = running && i === idx
        return (
          <g key={i}>
            <path d={arc(a0, a1, R)} fill="none" stroke={PHASE_COLOR[label] ?? '#fff'} strokeWidth={lit ? 6 : 4} strokeLinecap="round" opacity={lit ? 1 : 0.45} style={{ transition: 'opacity .8s, stroke-width .8s' }} />
            <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#efe9dd" opacity={lit ? 0.95 : 0.55} fontFamily="Manrope, system-ui, sans-serif">{SHORT[label] ?? label} {secs}</text>
          </g>
        )
      })}
      <motion.g initial={false} animate={{ rotate: running ? end : 0 }} transition={running ? { duration: phases[idx][1], ease: 'linear' } : { duration: 0.8, ease: 'easeOut' }}>
        <circle cx="0" cy={-R} r="11" fill="#fff" opacity="0.18" />
        <circle cx="0" cy={-R} r="6.5" fill="#fffaf0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,.9))' }} />
      </motion.g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Leaves on a stream                                                  */
/* ------------------------------------------------------------------ */

const streamY = (p: number) => 50 + Math.sin(p * Math.PI * 2 + 0.6) * 12

function Leaf({ hue }: { hue: string }) {
  return (
    <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden>
      <path d="M1 8 C6 0 18 0 25 8 C18 16 6 16 1 8 Z" fill={hue} />
      <path d="M3 8 H22" stroke="#fff" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  )
}

/**
 * A classic mindfulness exercise: put each thought on a leaf and watch it
 * float away. `leaves` are ids of thoughts just let go.
 */
export function LeafStream({ leaves, onDone, className = '' }: { leaves: number[]; onDone: (id: number) => void; className?: string }) {
  const steps = Array.from({ length: 9 }, (_, i) => i / 8)
  const path = (k: number) => `M0 ${streamY(0) + k} ${Array.from({ length: 24 }, (_, i) => `L${((i + 1) / 24) * 360} ${(streamY((i + 1) / 24) + k).toFixed(1)}`).join(' ')}`
  const float = (delay: number, repeat: boolean, id?: number) => ({
    initial: { left: '-8%', top: `${streamY(0) - 8}%`, rotate: -8, opacity: 0 },
    animate: { left: steps.map((p) => `${p * 108 - 8}%`), top: steps.map((p) => `${streamY(p) - 8}%`), rotate: steps.map((_, i) => (i % 2 ? 10 : -8)), opacity: steps.map((p) => (p < 0.08 || p > 0.92 ? 0 : 1)) },
    transition: { duration: 12, ease: 'linear' as const, delay, repeat: repeat ? Infinity : 0, repeatDelay: 6 },
    onAnimationComplete: id != null ? () => onDone(id) : undefined,
  })
  return (
    <div className={`relative h-28 overflow-hidden rounded-[26px] ${className}`}>
      <svg viewBox="0 0 360 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect width="360" height="100" fill="color-mix(in oklab, var(--pista) 22%, var(--card))" />
        <path d={`${path(-16)} L360 ${streamY(1) + 16} ${Array.from({ length: 25 }, (_, i) => `L${((24 - i) / 24) * 360} ${(streamY((24 - i) / 24) + 16).toFixed(1)}`).join(' ')} Z`} fill="color-mix(in oklab, var(--sky) 50%, var(--card))" />
        <path d={path(-5)} fill="none" stroke="var(--card)" strokeWidth="1.3" strokeDasharray="10 16" className="flow" opacity="0.8" />
        <path d={path(7)} fill="none" stroke="var(--card)" strokeWidth="1" strokeDasharray="6 18" className="flow" style={{ animationDuration: '20s' }} opacity="0.7" />
      </svg>
      <motion.span className="absolute" {...float(0, true)}><Leaf hue="color-mix(in oklab, var(--pista) 80%, var(--ink))" /></motion.span>
      <motion.span className="absolute" {...float(7, true)}><Leaf hue="var(--haldi)" /></motion.span>
      <AnimatePresence>
        {leaves.map((id) => (
          <motion.span key={id} className="absolute z-10" {...float(0.2, false, id)} exit={{ opacity: 0 }}>
            <Leaf hue="var(--care)" />
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}
