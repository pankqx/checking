import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { BuddyBadge, Caption } from '../components/Buddy'
import { Orb } from '../components/Orb'
import { characters, pick } from '../character/characters'
import { getBuddy, say, setFace } from '../lib/buddy'
import { Screen } from '../components/ui'
import { isCrisis } from '../lib/analysis'
import { HELPLINE } from '../lib/companion'
import { db, dayKey } from '../lib/db'
import { go } from '../lib/nav'
import { moodFromText, recordMic, transcribe } from '../lib/voice'

const MOODS = ['heavy', 'low', 'okay', 'good', 'bright']
const TAGS = ['classes', 'deadlines', 'friends', 'family', 'tired', 'exercise', 'alone', 'proud', 'anxious', 'bored']

export default function CheckIn() {
  const [mood, setMood] = useState<number | null>(null)
  const [energy, setEnergy] = useState(3)
  const [stress, setStress] = useState(3)
  const [sleep, setSleep] = useState(7)
  const [social, setSocial] = useState<0 | 1 | 2 | undefined>()
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const [voice, setVoice] = useState<'idle' | 'rec' | 'think'>('idle')
  const [dl, setDl] = useState<number>()
  const started = useRef(Date.now())
  const rec = useRef<Awaited<ReturnType<typeof recordMic>> | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const chooseMood = (m: number) => {
    setMood(m)
    const c = characters[getBuddy().character]
    if (m <= 2) say(pick(c.comfort), { expression: 'concerned' })
    else if (m >= 4) say(pick(c.cheer).replace('That’s the spirit.', 'Love that!'), { expression: 'happy' })
    else say('Okay is okay. Thanks for checking in.', { expression: 'neutral' })
  }

  useEffect(() => {
    say('How’s your mind right now? Just tap a face. No wrong answers.', { expression: 'neutral' })
    return () => setFace('neutral')
  }, [])

  useEffect(() => {
    db.profile.get('me').then((p) => p?.usualSleep && setSleep(p.usualSleep))
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const save = async () => {
    await db.checkins.add({ day: dayKey(), at: Date.now(), mood: mood ?? 3, energy, stress, sleep, social, tags, note: note || undefined, via: voice === 'idle' && !note ? 'tap' : 'voice' })
    const secs = Math.round((Date.now() - started.current) / 1000)
    setDone(secs)
    say(isCrisis(note) ? 'I’m really glad you told me. Please talk to someone today. Tele-MANAS is free on 14416, any time.' : `Saved, in just ${secs} seconds. Thank you for checking in with yourself.`, { expression: isCrisis(note) ? 'concerned' : 'happy' })
  }

  const toggleVoice = async () => {
    if (voice === 'idle') {
      try {
        rec.current = await recordMic()
        setVoice('rec')
      } catch {
        alert('Microphone not available. You can type instead.')
      }
    } else if (voice === 'rec' && rec.current) {
      setVoice('think')
      const pcm = await rec.current.stop()
      try {
        const text = await transcribe(pcm, setDl)
        setNote((n) => (n ? n + ' ' : '') + text)
        if (mood == null) setMood(moodFromText(text))
      } finally {
        setVoice('idle')
        setDl(undefined)
      }
    }
  }

  if (done != null)
    return (
      <Screen title={<>Saved. <span className="display-i text-accent">Thank you.</span></>} kicker="check-in">
        <div className="flex flex-col items-center text-center">
          <Orb mood={mood ?? 3} size={200} />
          <div className="mt-2 flex w-full items-start gap-3 text-left"><BuddyBadge size={56} /><Caption className="flex-1" /></div>
          <p className="display mt-4 text-6xl">{done}s</p>
          <p className="text-ink-soft">That&rsquo;s all it took. Small daily notes are how I learn your normal.</p>
          {isCrisis(note) && <div className="card mt-6 border-(--care) p-5 text-left"><p className="font-semibold text-(--care-ink)">Please don&rsquo;t carry this alone</p><p className="mt-1 text-sm">{HELPLINE}</p><a href="tel:14416" className="btn btn-urgent mt-4">Call Tele-MANAS 14416</a></div>}
          <div className="mt-8 flex gap-3">
            <button className="btn" onClick={() => go('insights')}>See what changed</button>
            <button className="btn btn-ghost" onClick={() => go('home')}>Home</button>
          </div>
        </div>
      </Screen>
    )

  return (
    <Screen title={<>How&rsquo;s your <span className="display-i text-accent">mind</span>?</>} kicker={`check-in · ${elapsed}s`}>
      <div className="mb-5 flex items-start gap-3"><BuddyBadge size={60} /><Caption className="flex-1" /></div>
      {/* Mood: tap an orb */}
      <div className="grid grid-cols-5 gap-1">
        {MOODS.map((m, i) => (
          <button key={m} onClick={() => chooseMood(i + 1)} className={`flex flex-col items-center rounded-3xl py-2 transition ${mood === i + 1 ? 'bg-card shadow-[var(--shadow)]' : 'opacity-60'}`} aria-pressed={mood === i + 1}>
            <Orb mood={i + 1} size={58} speed={mood === i + 1 ? 2 : 0.6} />
            <span className="text-xs font-semibold">{m}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {mood != null && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-6 space-y-6">
              <Scale label="Energy" value={energy} set={setEnergy} ends={['drained', 'charged']} />
              <Scale label="Pressure" value={stress} set={setStress} ends={['light', 'crushing']} />
              <div>
                <div className="mb-2 flex items-baseline justify-between"><span className="font-semibold">Sleep last night</span><span className="display text-2xl">{sleep} h</span></div>
                <input type="range" min={2} max={12} step={0.5} value={sleep} onChange={(e) => setSleep(+e.target.value)} className="w-full" />
              </div>
              <div>
                <p className="mb-2 font-semibold">Talked to someone you like today?</p>
                <div className="flex gap-2">
                  {(['not really', 'a little', 'yes'] as const).map((l, i) => (
                    <button key={l} className="chip flex-1" aria-pressed={social === i} onClick={() => setSocial(i as 0 | 1 | 2)}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-semibold">Anything in the mix? <span className="font-normal text-ink-faint">optional</span></p>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((t) => (
                    <button key={t} className="chip" aria-pressed={tags.includes(t)} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="card flex items-start gap-3 p-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="One line about today… or say it" className="flex-1 resize-none bg-transparent p-1 outline-none" />
                <button onClick={toggleVoice} disabled={voice === 'think'} className={`grid size-11 shrink-0 place-items-center rounded-full ${voice === 'rec' ? 'animate-pulse bg-care text-white' : 'bg-paper-2'}`} aria-label="Voice check-in">
                  {voice === 'think' ? <span className="text-[10px]">{dl != null ? `${Math.round(dl)}%` : '…'}</span> : <MicIcon />}
                </button>
              </div>
              {voice === 'think' && <p className="text-xs text-ink-faint">Transcribing on your device (first time downloads a small model)…</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button className="btn mt-8 w-full py-4 text-lg" disabled={mood == null} onClick={save}>Save check-in</button>
      <p className="mt-3 text-center text-xs text-ink-faint">Only stored on this device.</p>
    </Screen>
  )
}

function Scale({ label, value, set, ends }: { label: string; value: number; set: (n: number) => void; ends: [string, string] }) {
  return (
    <div>
      <p className="mb-2 font-semibold">{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs text-ink-faint">{ends[0]}</span>
        <div className="flex flex-1 justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => set(n)} aria-label={`${label} ${n}`} className="grid size-11 place-items-center">
              <motion.span animate={{ scale: n === value ? 1 : 0.55 }} className="block size-8 rounded-full" style={{ background: n <= value ? 'var(--ink)' : 'var(--line)' }} />
            </button>
          ))}
        </div>
        <span className="w-16 text-right text-xs text-ink-faint">{ends[1]}</span>
      </div>
    </div>
  )
}

export const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
)
