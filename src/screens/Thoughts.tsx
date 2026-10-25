import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { LeafStream } from '../components/art'
import { Screen } from '../components/ui'
import { isCrisis } from '../lib/analysis'
import { HELPLINE } from '../lib/companion'
import { db, type Thought } from '../lib/db'
import { go } from '../lib/nav'
import { useData } from '../lib/useData'

// Guided + gratitude journal. Notes are pinned like paper slips.

const PROMPTS: Record<Thought['kind'], string[]> = {
  thought: ['What’s been looping in your head today?', 'What would you tell a friend who felt like you do?', 'What drained you today? What refilled you?', 'One thing you’re avoiding, and why?'],
  gratitude: ['One small good thing from today?', 'Who made your day a little easier?', 'Something your body did for you today?', 'A sound, smell or taste you liked today?'],
  worry: ['What’s the worry, in one sentence?', 'What’s the worst that could happen, and how likely is it really?'],
}
const KIND_COLOR: Record<Thought['kind'], string> = { thought: 'var(--card)', gratitude: 'color-mix(in oklab, var(--haldi) 35%, var(--card))', worry: 'color-mix(in oklab, var(--gulabi) 40%, var(--card))' }

export default function Thoughts() {
  const { thoughts } = useData()
  const [kind, setKind] = useState<Thought['kind']>('thought')
  const [text, setText] = useState('')
  const [prompt, setPrompt] = useState(0)
  const [leaves, setLeaves] = useState<number[]>([])
  const letGo = (id: number) => {
    setLeaves((l) => [...l, id])
    navigator.vibrate?.(10)
    db.thoughts.update(id, { released: true })
  }
  const p = PROMPTS[kind][prompt % PROMPTS[kind].length]

  const save = async () => {
    if (!text.trim()) return
    await db.thoughts.add({ at: Date.now(), kind, text: text.trim() })
    setText('')
    setPrompt((x) => x + 1)
  }

  return (
    <Screen title={<>Thoughts, <span className="display-i text-accent">on paper</span>.</>} kicker="journal · private">
      <div className="mb-4 flex gap-2">
        {(['thought', 'gratitude', 'worry'] as const).map((k) => (
          <button key={k} className="chip capitalize" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'thought' ? 'Thought' : k === 'gratitude' ? 'Grateful for' : 'Worry'}</button>
        ))}
      </div>
      <div className="card relative p-5" style={{ background: KIND_COLOR[kind] }}>
        <button onClick={() => setPrompt((x) => x + 1)} className="display-i text-left text-xl text-ink-soft" title="Another prompt">{p} <span className="text-sm">↻</span></button>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Write freely. No one else will read this." className="mt-3 w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-ink-faint" style={{ backgroundImage: 'repeating-linear-gradient(transparent 0 31px, var(--line) 31px 32px)', lineHeight: '32px' }} />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink-faint">{text.length ? `${text.trim().split(/\s+/).length} words` : ''}</span>
          <div className="flex gap-2">
            {kind === 'worry' && text && <button className="btn btn-ghost py-2 text-sm" onClick={() => { sessionStorage.setItem('mm-shred', text); go('release') }}>Shred it instead</button>}
            <button className="btn py-2" onClick={save} disabled={!text.trim()}>Keep</button>
          </div>
        </div>
      </div>
      {isCrisis(text) && (
        <div className="card mt-4 border-(--care) p-5"><p className="font-semibold text-(--care-ink)">I&rsquo;m really glad you wrote this down.</p><p className="mt-1 text-sm">{HELPLINE}</p><a href="tel:14416" className="btn btn-urgent mt-3">Call 14416</a></div>
      )}

      <div className="mt-8">
        <LeafStream leaves={leaves} onDone={(id) => setLeaves((l) => l.filter((x) => x !== id))} />
        <p className="mt-2 px-1 text-xs text-ink-faint">Leaves on a stream: tap &ldquo;let go&rdquo; on a note and watch it float away. The thought can come back; you don&rsquo;t have to hold it.</p>
      </div>

      <div className="mt-6 columns-2 gap-3 sm:columns-3">
        <AnimatePresence>
          {thoughts.filter((t) => !t.released).map((t, i) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, rotate: ((i * 37) % 7) - 3 }} exit={{ opacity: 0, x: 30, y: -10, rotate: 8, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }} className="card mb-3 break-inside-avoid rounded-2xl p-4" style={{ background: KIND_COLOR[t.kind] }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">{t.kind} · {new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              <p className="mt-1 leading-snug">{t.text}</p>
              <button className="mt-2 text-xs text-ink-faint" onClick={() => letGo(t.id!)}>let go 🍃</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!thoughts.length && <p className="mt-6 text-center text-ink-faint">Your notes will gather here.</p>}
    </Screen>
  )
}
