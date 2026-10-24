import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { go, type Route } from '../lib/nav'
import { usePageMotion } from './fx'

export function Screen({ title, kicker, children, back = 'home', tint }: { title: ReactNode; kicker?: string; children: ReactNode; back?: Route | null; tint?: string }) {
  const pm = usePageMotion()
  return (
    <motion.main
      {...pm}
      className="mx-auto max-w-xl px-4 pt-6 pb-32"
      style={tint ? { background: `radial-gradient(120% 40% at 50% 0%, color-mix(in oklab, ${tint} 18%, transparent), transparent)` } : undefined}
    >
      <header className="mb-6 flex items-start gap-3">
        {back && (
          <button onClick={() => go(back)} className="mt-1 grid size-10 shrink-0 place-items-center rounded-full border border-line bg-card" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div>
          {kicker && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">{kicker}</p>}
          <h1 className="display text-4xl leading-[1.05]">{title}</h1>
        </div>
      </header>
      {children}
    </motion.main>
  )
}

export function Stamp({ children, color = 'var(--sindoor)' }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ borderColor: color, color }}>
      {children}
    </span>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between px-1">
        <h2 className="display-i text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Hand-drawn style doodles used as widget art. */
export function Doodle({ kind, className = '' }: { kind: 'leaf' | 'wave' | 'spark' | 'lotus' | 'heart' | 'cloud' | 'pendant' | 'grid'; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {kind === 'leaf' && <g {...p}><path d="M12 52C12 28 28 12 52 12c0 24-16 40-40 40Z" /><path d="M12 52 40 24" /></g>}
      {kind === 'wave' && <g {...p}><path d="M4 26q7-8 14 0t14 0 14 0 14 0" /><path d="M4 38q7-8 14 0t14 0 14 0 14 0" /><path d="M4 50q7-8 14 0t14 0 14 0 14 0" /></g>}
      {kind === 'spark' && <g {...p}><path d="M32 6v16M32 42v16M6 32h16M42 32h16M14 14l9 9M41 41l9 9M50 14l-9 9M23 41l-9 9" /></g>}
      {kind === 'lotus' && <g {...p}><path d="M32 50c-8-8-8-22 0-32 8 10 8 24 0 32Z" /><path d="M32 50c-12 0-20-8-22-20 10 0 18 6 22 20Z" /><path d="M32 50c12 0 20-8 22-20-10 0-18 6-22 20Z" /><path d="M10 54h44" /></g>}
      {kind === 'heart' && <g {...p}><path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30Z" /><path d="M14 30h8l4-6 5 12 4-8h15" /></g>}
      {kind === 'cloud' && <g {...p}><path d="M18 46a10 10 0 0 1 0-20 14 14 0 0 1 27-3 11 11 0 0 1 1 23Z" /><circle cx="20" cy="56" r="2" /><circle cx="12" cy="58" r="1.2" /></g>}
      {kind === 'pendant' && <g {...p}><path d="M14 6c0 14 8 22 18 26 10-4 18-12 18-26" /><circle cx="32" cy="44" r="12" /><circle cx="32" cy="44" r="4" /></g>}
      {kind === 'grid' && <g {...p}>{[14, 32, 50].map((x) => [14, 32, 50].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="6" />))}</g>}
    </svg>
  )
}
