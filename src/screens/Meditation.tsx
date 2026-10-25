import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { BreathClock } from '../components/art'
import { Buddy } from '../components/Buddy'
import { chime, playScape, stopScape, type Scape } from '../lib/audio'
import { hush, say, setFace, useBuddy } from '../lib/buddy'
import { db } from '../lib/db'
import { go } from '../lib/nav'
import { sendCalm, usePendant } from '../lib/pendantStore'
import { useWatch } from '../lib/watchStore'

// The meditation room: an immersive indigo night, a breathing lotus,
// generated soundscapes (rain, ocean, tanpura drone) and gentle haptics.

const PATTERNS = {
  calm: { name: 'Calm', sub: 'in 4 · out 6', phases: [['Breathe in', 4], ['Breathe out', 6]] },
  box: { name: 'Box', sub: '4 · 4 · 4 · 4', phases: [['Breathe in', 4], ['Hold', 4], ['Breathe out', 4], ['Hold', 4]] },
  sleep: { name: '4-7-8', sub: 'for sleep', phases: [['Breathe in', 4], ['Hold', 7], ['Breathe out', 8]] },
} as const
type P = keyof typeof PATTERNS
const SCAPES: { id: Scape; label: string }[] = [{ id: 'tanpura', label: 'Tanpura' }, { id: 'rain', label: 'Rain' }, { id: 'ocean', label: 'Ocean' }, { id: 'silence', label: 'Silence' }]

export default function Meditation() {
  const [pattern, setPattern] = useState<P>('calm')
  const [scape, setScape] = useState<Scape>('tanpura')
  const [mins, setMins] = useState(3)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(0)
  const [left, setLeft] = useState(0)
  const [hrStart, setHrStart] = useState<number>()
  const [finished, setFinished] = useState<null | { mins: number; hrDrop?: number }>(null)
  const watch = useWatch()
  const pendant = usePendant()
  const startedAt = useRef(0)
  const buddy = useBuddy()

  useEffect(() => {
    const t = setTimeout(() => say('Welcome to the quiet room. Pick a rhythm and a sound, and I’ll breathe with you.', { expression: 'calm' }), 400)
    return () => { clearTimeout(t); hush(); setFace('neutral') }
  }, [])

  const phases = PATTERNS[pattern].phases
  const [label, secs] = phases[phase % phases.length]

  useEffect(() => () => stopScape(), [])

  useEffect(() => {
    if (!running) return
    navigator.vibrate?.(label === 'Hold' ? 20 : 60)
    // she guides the first two cycles out loud, then lets you breathe in silence
    if (phase < phases.length * 2) say(label === 'Hold' ? 'Hold…' : `${label}…`, { expression: 'calm' })
    else if (buddy.line) setFace('calm', 'IDLE')
    const t = setTimeout(() => setPhase((p) => p + 1), secs * 1000)
    return () => clearTimeout(t)
  }, [running, phase, label, secs])

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      const l = Math.max(0, mins * 60 - Math.round((Date.now() - startedAt.current) / 1000))
      setLeft(l)
      if (l === 0) end(true)
    }, 500)
    return () => clearInterval(t)
  })

  const start = () => {
    startedAt.current = Date.now()
    setPhase(0)
    setLeft(mins * 60)
    setRunning(true)
    setFinished(null)
    setHrStart(watch.bpm)
    playScape(scape, 0.45)
    chime(396)
    if (pendant.status === 'connected') sendCalm(Math.round((mins * 60) / phases.reduce((a, p) => a + p[1], 0)))
  }

  const end = async (complete: boolean) => {
    setRunning(false)
    stopScape()
    chime(528)
    say(complete ? 'Beautiful. Notice how you feel right now. Carry a little of this with you.' : 'That’s okay. Even a minute counts.', { expression: 'happy' })
    const m = Math.max(0.5, (Date.now() - startedAt.current) / 60000)
    await db.sessions.add({ at: Date.now(), room: 'meditation', activity: PATTERNS[pattern].name, minutes: Math.round(m * 10) / 10 })
    setFinished({ mins: complete ? mins : Math.round(m * 10) / 10, hrDrop: hrStart && watch.bpm ? hrStart - watch.bpm : undefined })
  }

  const inhale = label === 'Breathe in'
  const exhale = label === 'Breathe out'

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative min-h-dvh overflow-hidden text-[#efe9dd]" style={{ background: 'radial-gradient(120% 80% at 50% 10%, #2a356f 0%, #141a38 55%, #0b0f22 100%)' }}>
      <Stars />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <button onClick={() => { stopScape(); go('home') }} className="grid size-10 place-items-center rounded-full border border-white/20" aria-label="Leave room">✕</button>
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-60">Meditation room</p>
          <span className="w-10 text-right text-sm tabular-nums opacity-70">{watch.bpm ? `♥ ${watch.bpm}` : ''}</span>
        </div>

        <div className="relative my-4 flex flex-1 flex-col items-center justify-center">
          <motion.div
            className="absolute rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(169,195,240,.45), rgba(174,163,212,.16) 60%, transparent 70%)' }}
            animate={{ width: running ? (inhale ? 330 : exhale ? 150 : undefined) : 220, height: running ? (inhale ? 330 : exhale ? 150 : undefined) : 220 }}
            transition={{ duration: running ? secs : 1.5, ease: 'easeInOut' }}
          />
          <div className="relative flex flex-col items-center">
            <BreathClock phases={phases} running={running} phase={phase} className="pointer-events-none absolute left-1/2 top-[44%] w-[340px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2" />
            <Buddy height={300} track={!running} />
            <div className="-mt-20"><Lotus open={running ? (inhale ? 1 : exhale ? 0 : undefined) : 0.4} dur={running ? secs : 1.5} /></div>
          </div>
          <div className="mt-3 text-center">
            <AnimatePresence mode="wait">
              <motion.p key={running ? `${phase}` : finished ? 'done' : 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="display-i text-3xl">
                {running ? label : finished ? 'Well done.' : 'Settle in.'}
              </motion.p>
            </AnimatePresence>
            {!running && buddy.line && <p className="mx-auto mt-1 max-w-xs text-sm opacity-70">{buddy.line}</p>}
            {running && <p className="mt-1 text-sm tabular-nums opacity-60">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
            {finished && (
              <p className="mt-1 text-sm opacity-75">
                {finished.mins} min of quiet{finished.hrDrop && finished.hrDrop > 0 ? ` · heart rate eased by ${finished.hrDrop} bpm` : ''}
              </p>
            )}
          </div>
        </div>

        {!running ? (
          <div className="space-y-4">
            <Row>{(Object.keys(PATTERNS) as P[]).map((k) => <Pill key={k} on={pattern === k} onClick={() => setPattern(k)}>{PATTERNS[k].name}<span className="block text-[10px] opacity-60">{PATTERNS[k].sub}</span></Pill>)}</Row>
            <Row>{SCAPES.map((s) => <Pill key={s.id} on={scape === s.id} onClick={() => { setScape(s.id); playScape(s.id, 0.35); setTimeout(stopScape, 2500) }}>{s.label}</Pill>)}</Row>
            <Row>{[1, 3, 5, 10].map((m) => <Pill key={m} on={mins === m} onClick={() => setMins(m)}>{m} min</Pill>)}</Row>
            <button onClick={start} className="mt-2 w-full rounded-full bg-[#efe9dd] py-4 text-lg font-semibold text-[#141a38]">Begin</button>
            {pendant.status === 'connected' && <p className="text-center text-xs opacity-60">Your pendant will glow and tap along with your breath.</p>}
          </div>
        ) : (
          <button onClick={() => end(false)} className="w-full rounded-full border border-white/25 py-4 font-semibold">End gently</button>
        )}
      </div>
    </motion.main>
  )
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex gap-2">{children}</div>
const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`flex-1 rounded-2xl border px-2 py-2.5 text-sm font-semibold transition ${on ? 'border-transparent bg-white/90 text-[#141a38]' : 'border-white/20 text-white/80'}`}>{children}</button>
)

function Lotus({ open, dur }: { open?: number; dur: number }) {
  const petals = [-60, -30, 0, 30, 60]
  return (
    <svg viewBox="-100 -100 200 200" width="120" height="120" className="relative" aria-hidden>
      {petals.map((a, i) => (
        <motion.path
          key={a}
          d="M0,40 C-22,10 -18,-40 0,-70 C18,-40 22,10 0,40Z"
          fill={i % 2 ? 'rgba(236,116,88,.75)' : 'rgba(232,180,164,.85)'}
          stroke="#efe9dd"
          strokeWidth="1"
          style={{ originX: '50%', originY: '100%' }}
          animate={open != null ? { rotate: a * (0.35 + open * 0.75), scale: 0.85 + open * 0.2 } : undefined}
          transition={{ duration: dur, ease: 'easeInOut' }}
        />
      ))}
      <circle cx="0" cy="40" r="10" fill="#efbd55" />
    </svg>
  )
}

function Stars() {
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 73) % 100, y: (i * 41) % 60, s: (i % 3) + 1, d: (i % 5) + 2 }))
  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <motion.span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }} animate={{ opacity: [0.15, 0.8, 0.15] }} transition={{ duration: s.d, repeat: Infinity, delay: i * 0.1 }} />
      ))}
    </div>
  )
}
