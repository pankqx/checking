import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { SkyScene } from '../components/art'
import { db } from '../lib/db'
import { seedDemo } from '../lib/seed'
import Onboarding from './Onboarding'

// The first screen: three calm doors instead of a form. Each is one tap, and
// the chosen card stays while the others drift away, so the move feels gentle.

type Door = 'preview' | 'voice' | 'checkin'

const DOORS: { id: Door; title: string; line: string; tint: string; glyph: ReactNode }[] = [
  {
    id: 'preview',
    title: 'Preview',
    line: 'Look around first. A sample week shows how MindMirror notices change.',
    tint: 'var(--sky)',
    glyph: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.6" /></>,
  },
  {
    id: 'voice',
    title: 'Voice mode',
    line: 'Just talk, by phone or by your necklace. I listen and keep a note.',
    tint: 'var(--dusk)',
    glyph: <path d="M4 12h1.5M7.5 8.5v7M11 5.5v13M14.5 8v8M18 10.5v3M20.5 12H20" />,
  },
  {
    id: 'checkin',
    title: 'Check-in',
    line: 'Thirty seconds. How is your mind right now?',
    tint: 'var(--care)',
    glyph: <><circle cx="12" cy="12" r="7.5" /><path d="M8.8 13.6c.9 1.2 2 1.8 3.2 1.8s2.3-.6 3.2-1.8M9.4 10h.01M14.6 10h.01" /></>,
  },
]

const greet = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.'
}

export default function Start() {
  const [chosen, setChosen] = useState<Door | null>(null)
  const [setup, setSetup] = useState(false)
  if (setup) return <Onboarding />

  const open = (d: Door) => {
    if (chosen) return
    setChosen(d)
    navigator.vibrate?.(8)
    setTimeout(async () => {
      await db.profile.put({ id: 'me', reasons: [], usualSleep: 7, onboardedAt: Date.now() })
      if (d === 'preview') await seedDemo()
      location.hash = d === 'preview' ? '#/home' : `#/${d}`
    }, 900)
  }

  const ease = [0.22, 1, 0.36, 1] as const
  return (
    <motion.main
      className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.8 } }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <motion.div animate={{ opacity: chosen ? 0 : 1, y: chosen ? -8 : 0 }} transition={{ duration: 0.5, ease }}>
        <div className="flex items-center gap-4">
          <SkyScene variant="arch" weather={{ score: 0, name: 'Clear skies' }} className="w-16 shrink-0" />
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-ink-faint">MindMirror</p>
        </div>
        <motion.h1 className="display mt-8 text-[2.6rem] leading-[1.05]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.1, ease }}>
          {greet()}
          <br />
          <span className="display-i text-accent">Where would you like to begin?</span>
        </motion.h1>
        <motion.p className="mt-3 text-ink-soft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.35 }}>
          Everything stays on this device. You can change your mind any time.
        </motion.p>
      </motion.div>

      <div className="mt-8 flex flex-col gap-3">
        {DOORS.map((d, i) => {
          const me = chosen === d.id
          const other = chosen && !me
          return (
            <motion.button
              key={d.id}
              onClick={() => open(d.id)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: other ? 0 : 1, y: other ? 10 : me ? -4 : 0, scale: me ? 1.02 : 1 }}
              transition={{ duration: other || me ? 0.55 : 0.8, delay: chosen ? 0 : 0.45 + i * 0.12, ease }}
              whileTap={{ scale: 0.985 }}
              className="card relative flex items-center gap-4 overflow-hidden rounded-[28px] p-4 text-left"
              style={me ? { borderColor: `color-mix(in oklab, ${d.tint} 70%, transparent)` } : undefined}
            >
              <AnimatePresence>
                {me && (
                  <motion.span
                    className="pointer-events-none absolute inset-0"
                    style={{ background: `radial-gradient(120% 140% at 10% 50%, color-mix(in oklab, ${d.tint} 30%, transparent), transparent 70%)` }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                  />
                )}
              </AnimatePresence>
              <span className="relative grid size-14 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${d.tint} 32%, var(--card))`, color: `color-mix(in oklab, ${d.tint} 45%, var(--ink))` }}>
                {me && <span className="breathe absolute inset-0 rounded-full" style={{ background: `color-mix(in oklab, ${d.tint} 30%, transparent)`, ['--breathe-to' as string]: 1.35 }} />}
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="relative" aria-hidden>{d.glyph}</svg>
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="display block text-[1.45rem] leading-tight">{d.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{me ? 'Opening gently…' : d.line}</span>
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative shrink-0 text-ink-faint" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
            </motion.button>
          )
        })}
      </div>

      <motion.div className="mt-auto flex flex-col items-center gap-3 pt-10" initial={{ opacity: 0 }} animate={{ opacity: chosen ? 0 : 1 }} transition={{ duration: 0.8, delay: chosen ? 0 : 1 }}>
        <button onClick={() => setSetup(true)} className="text-sm font-semibold text-ink-soft underline decoration-line underline-offset-4">Set up step by step instead</button>
        <p className="flex items-center gap-2 text-xs text-ink-faint"><span className="inline-block size-1.5 rounded-full bg-pista" /> Not a medical device · Tele-MANAS 14416, free, 24×7</p>
      </motion.div>
    </motion.main>
  )
}
