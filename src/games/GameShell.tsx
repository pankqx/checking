import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function SoundToggle({ muted, onToggle, className = '' }: { muted: boolean; onToggle: () => void; className?: string }) {
  return (
    <button onClick={onToggle} className={`grid size-10 place-items-center rounded-full bg-white/10 backdrop-blur-md transition hover:bg-white/20 ${className}`} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <><path d="M15.5 9a4.5 4.5 0 0 1 0 6" /><path d="M18 6.5a8 8 0 0 1 0 11" /></>}
      </svg>
    </button>
  )
}

/** Full-screen frame for a calm game: a back button, the name, sound, a hint and controls. */
export function GameShell({ title, hint, dark, bg, muted, onToggleSound, onClose, controls, children }: { title: string; hint: string; dark: boolean; bg: string; muted: boolean; onToggleSound: () => void; onClose: () => void; controls?: ReactNode; children: ReactNode }) {
  const ink = dark ? 'text-[#efeaf7]' : 'text-[#2c2a24]'
  return (
    <motion.div
      className={`fixed inset-0 z-[90] overflow-hidden ${ink}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.6 } }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      role="dialog"
      aria-label={title}
    >
      {children}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52" style={{ background: `linear-gradient(color-mix(in srgb, ${bg} 92%, transparent) 42%, transparent)` }} />
      {controls && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(transparent, color-mix(in srgb, ${bg} 80%, transparent))` }} />}
      <div className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className={`pointer-events-auto flex items-center gap-1 rounded-full py-2 pr-4 pl-3 text-sm font-semibold backdrop-blur-md transition ${dark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
            Done
          </button>
          <SoundToggle muted={muted} onToggle={onToggleSound} className={`pointer-events-auto ${dark ? '' : '!bg-black/5 hover:!bg-black/10'}`} />
        </div>
        <div className="mt-4 text-center">
          <h1 className="font-[Fraunces] text-[28px] leading-tight italic">{title}</h1>
          <p className={`mx-auto mt-1 max-w-[20rem] text-[14px] leading-relaxed ${dark ? 'text-white/70' : 'text-black/55'}`}>{hint}</p>
        </div>
      </div>
      {controls && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 px-4 pb-[max(22px,env(safe-area-inset-bottom))]">
          {controls}
        </div>
      )}
    </motion.div>
  )
}

export function GameChip({ on, onClick, children, dark }: { on?: boolean; onClick: () => void; children: ReactNode; dark: boolean }) {
  const base = dark ? (on ? 'bg-[#efeaf7] text-[#1c2150]' : 'bg-white/10 text-inherit hover:bg-white/20') : (on ? 'bg-[#2e3573] text-[#f7f3ec]' : 'bg-black/5 text-inherit hover:bg-black/10')
  return (
    <button onClick={onClick} aria-pressed={on} className={`rounded-full px-4 py-2.5 text-sm font-semibold backdrop-blur-md transition active:scale-[.97] ${base}`}>
      {children}
    </button>
  )
}
