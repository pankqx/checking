import { AnimatePresence, motion } from 'framer-motion'
import { characters } from '../character/characters'
import { InkCharacter } from '../character/InkCharacter'
import { say, setVoice, useBuddy } from '../lib/buddy'

/** The companion, full bust, driven by the shared buddy state. */
export function Buddy({ height = 360, track = true, className = '' }: { height?: number | string; track?: boolean; className?: string }) {
  const b = useBuddy()
  return <InkCharacter config={characters[b.character]} state={b.state} expression={b.expression} height={height} track={track} className={className} />
}

/** Face-only crop of the companion inside a circle. */
export function BuddyBadge({ size = 64, ring = true }: { size?: number; ring?: boolean }) {
  const b = useBuddy()
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, background: 'var(--paper-2)', boxShadow: ring ? `0 0 0 2px var(--card), 0 0 0 4px ${characters[b.character].accent}` : undefined }}>
      <span className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.62 }}>
        <InkCharacter config={characters[b.character]} state={b.state} expression={b.expression} height={size * 2.3} track={false} />
      </span>
    </span>
  )
}

/** Speech bubble with karaoke highlighting of the word being spoken. */
export function Caption({ fallback, className = '', tail = 'left', replay }: { fallback?: string; className?: string; tail?: 'left' | 'bottom' | 'none'; replay?: string }) {
  const b = useBuddy()
  const text = b.line || fallback || ''
  const speaking = b.state === 'SPEAKING' || b.state === 'GREETING'
  const words = text.split(/(\s+)/)
  let n = -1
  return (
    <AnimatePresence mode="wait">
      {text && (
        <motion.div key={text} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className={`bubble relative rounded-[22px] px-4 py-3 ${tail === 'left' ? 'rounded-tl-md' : tail === 'bottom' ? 'rounded-bl-md' : ''} ${className}`}>
          <p className="display-i text-[1.15rem] leading-snug">
            {words.map((w, i) => {
              if (!/\S/.test(w)) return w
              n++
              const cls = !b.line || !speaking ? '' : n < b.word ? 'k-said' : n === b.word ? 'k-now' : 'k-next'
              return <span key={i} className={cls}>{w}</span>
            })}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            <span>{characters[b.character].name}</span>
            {replay && !speaking && <button className="underline underline-offset-2" onClick={() => say(replay)}>▶ hear it</button>}
            <button className="ml-auto" onClick={() => setVoice(!b.voice)} aria-pressed={b.voice}>{b.voice ? '🔊 voice on' : '🔈 muted'}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
