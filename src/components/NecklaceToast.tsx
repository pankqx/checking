import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { onTurn, useHub, type Turn } from '../lib/hub'
import { go } from '../lib/nav'

/** A quiet card at the top of any screen when the necklace hears you. */
export function NecklaceToast({ hidden }: { hidden?: boolean }) {
  const hub = useHub()
  const [turn, setTurn] = useState<Turn | null>(null)
  useEffect(() => onTurn((t) => { if (t.source === 'necklace') setTurn(t) }), [])
  useEffect(() => {
    if (!turn) return
    const id = setTimeout(() => setTurn(null), 12000)
    return () => clearTimeout(id)
  }, [turn])
  const listening = hub.status === 'thinking' && hub.thinking === 'necklace'
  const show = !hidden && (listening || turn)
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={listening ? 'listening' : turn?.at}
          className="fixed inset-x-0 top-0 z-[80] px-4 pt-[max(12px,env(safe-area-inset-top))]"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          role="status"
        >
          <button onClick={() => { setTurn(null); go('voice') }} className="card mx-auto flex w-full max-w-md items-start gap-3 rounded-3xl p-4 text-left shadow-[var(--shadow)]">
            <span className="relative mt-1 grid size-9 shrink-0 place-items-center rounded-full" style={{ background: 'color-mix(in oklab, var(--dusk) 35%, var(--card))', color: 'var(--accent)' }}>
              <span className="breathe absolute inset-0 rounded-full" style={{ background: 'color-mix(in oklab, var(--dusk) 30%, transparent)', ['--breathe-to' as string]: 1.4 }} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="relative" aria-hidden><path d="M7 3c0 7 2 10 5 11.5C15 13 17 10 17 3" /><circle cx="12" cy="18" r="3" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">{listening ? 'Your necklace' : 'Necklace heard you'}</span>
              {listening || !turn ? (
                <span className="mt-0.5 block text-sm text-ink-soft">Listening to what you said…</span>
              ) : (
                <>
                  <span className="display-i mt-0.5 block leading-snug">&ldquo;{turn.heard}&rdquo;</span>
                  <span className="mt-1 block text-sm leading-snug text-ink-soft">{turn.reply}</span>
                  <span className="mt-1.5 block text-xs text-ink-faint">Saved to today’s check-in and your journal.</span>
                </>
              )}
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
