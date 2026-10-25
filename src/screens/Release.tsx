import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { BuddyBadge, Caption } from '../components/Buddy'
import { Doodle, Screen } from '../components/ui'
import { characters, pick } from '../character/characters'
import { pop } from '../lib/audio'
import { getBuddy, say, setFace } from '../lib/buddy'
import { db } from '../lib/db'

// Pressure release room: four small, physical ways to let stress out.
// Nothing here is recorded. The shout jar only measures loudness.

type Tool = 'bubbles' | 'shred' | 'shout' | 'scribble'
const TOOLS: { id: Tool; name: string; line: string; color: string; art: 'grid' | 'wave' | 'spark' | 'cloud' }[] = [
  { id: 'bubbles', name: 'Bubble wrap', line: 'Pop until it feels better', color: 'var(--haldi)', art: 'grid' },
  { id: 'shred', name: 'Worry shredder', line: 'Type it. Shred it. Gone.', color: 'var(--gulabi)', art: 'wave' },
  { id: 'shout', name: 'Shout jar', line: 'Fill the jar with your voice', color: 'var(--care)', art: 'spark' },
  { id: 'scribble', name: 'Angry scribble', line: 'Scribble hard, then wipe', color: 'var(--pista)', art: 'cloud' },
]

export default function Release() {
  const [tool, setTool] = useState<Tool>(() => (sessionStorage.getItem('mm-shred') ? 'shred' : 'bubbles'))
  const started = useRef(Date.now())
  useEffect(() => {
    say('This room is for letting it out. Pop, shred, shout or scribble. Nobody’s watching, I promise.', { expression: 'happy' })
    return () => setFace('neutral')
  }, [])
  useEffect(() => () => {
    const m = (Date.now() - started.current) / 60000
    if (m > 0.2) db.sessions.add({ at: Date.now(), room: 'release', activity: 'release', minutes: Math.round(m * 10) / 10 })
  }, [])
  return (
    <Screen title={<>Let it <span className="display-i text-accent">out</span>.</>} kicker="pressure release room" tint="var(--gulabi)">
      <div className="mb-4 flex items-start gap-3"><BuddyBadge size={56} /><Caption className="flex-1" /></div>
      <div className="snap-row -mx-4">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => setTool(t.id)} className={`relative flex h-32 w-40 flex-col justify-end overflow-hidden rounded-3xl p-4 text-left transition ${tool === t.id ? 'ring-2 ring-ink' : 'opacity-75'}`} style={{ background: `color-mix(in oklab, ${t.color} 62%, #fff)`, color: '#1e1b16' }}>
            <Doodle kind={t.art} className="absolute -right-2 -top-2 size-16 opacity-30" />
            <span className="font-bold leading-tight">{t.name}</span>
            <span className="text-xs opacity-70">{t.line}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tool === 'bubbles' && <Bubbles />}
        {tool === 'shred' && <Shredder />}
        {tool === 'shout' && <ShoutJar />}
        {tool === 'scribble' && <Scribble />}
      </div>
    </Screen>
  )
}

const cheer = () => say(pick(characters[getBuddy().character].cheer), { expression: 'happy' })

function Bubbles() {
  const [popped, setPopped] = useState<Set<number>>(new Set())
  const [round, setRound] = useState(0)
  const n = 42
  const hit = (i: number) => {
    if (popped.has(i)) return
    pop()
    navigator.vibrate?.(12)
    const next = new Set(popped).add(i)
    setPopped(next)
    if (next.size % 14 === 0) cheer()
    if (next.size === n) setTimeout(() => { setPopped(new Set()); setRound((r) => r + 1) }, 700)
  }
  return (
    <div className="card p-4">
      <div className="mb-3 flex justify-between text-sm text-ink-soft"><span>{popped.size}/{n} popped</span><span>sheet {round + 1}</span></div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: n }, (_, i) => (
          <motion.button key={`${round}-${i}`} onPointerDown={() => hit(i)} whileTap={{ scale: 0.8 }} className="aspect-square rounded-full" aria-label="bubble"
            style={popped.has(i)
              ? { background: 'var(--paper-2)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.15)' }
              : { background: 'radial-gradient(circle at 35% 30%, #fff, color-mix(in oklab, var(--haldi) 40%, var(--card)) 60%)', boxShadow: '0 3px 8px -3px rgba(0,0,0,.3)' }} />
        ))}
      </div>
    </div>
  )
}

function Shredder() {
  const [text, setText] = useState(() => { const t = sessionStorage.getItem('mm-shred') ?? ''; sessionStorage.removeItem('mm-shred'); return t })
  const [shredding, setShredding] = useState<string | null>(null)
  const go = () => {
    if (!text.trim()) return
    setShredding(text)
    setText('')
    navigator.vibrate?.([30, 40, 30, 40, 30, 40, 80])
    setTimeout(() => setShredding(null), 2600)
    setTimeout(() => say('Gone. Shredded. It doesn’t get to sit in your head for free anymore.', { expression: 'happy' }), 1800)
  }
  const strips = 9
  return (
    <div className="card overflow-hidden p-5">
      <AnimatePresence mode="wait">
        {shredding ? (
          <motion.div key="s" className="relative h-48">
            <div className="absolute inset-x-0 top-24 z-10 h-4 rounded bg-ink" />
            <div className="flex h-full justify-center gap-0.5">
              {Array.from({ length: strips }, (_, i) => (
                <motion.div key={i} className="relative h-28 w-[11%] overflow-hidden bg-paper-2" initial={{ y: 0 }} animate={{ y: 260, rotate: (i - 4) * 4, opacity: [1, 1, 0] }} transition={{ duration: 2.2, ease: 'easeIn', delay: 0.15 }}>
                  <p className="absolute w-[900%] p-2 text-xs leading-tight" style={{ left: `-${i * 100}%` }}>{shredding}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="display-i text-xl text-ink-soft">What&rsquo;s weighing on you?</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="It won't be saved anywhere." className="mt-3 w-full resize-none rounded-2xl bg-paper-2 p-4 outline-none" />
            <button className="btn mt-3 w-full" onClick={go} disabled={!text.trim()}>Shred it</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ShoutJar() {
  const [fill, setFill] = useState(0)
  const [on, setOn] = useState(false)
  const stop = useRef<() => void>(() => {})
  useEffect(() => () => stop.current(), [])
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let raf = 0
      const loop = () => {
        an.getByteTimeDomainData(buf)
        let s = 0
        for (const v of buf) s += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(s / buf.length)
        setFill((f) => Math.min(100, f + Math.max(0, rms - 0.04) * 6))
        raf = requestAnimationFrame(loop)
      }
      loop()
      setOn(true)
      stop.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); setOn(false) }
    } catch {
      alert('Microphone not available.')
    }
  }
  useEffect(() => {
    if (fill >= 100) { stop.current(); navigator.vibrate?.([100, 60, 100]); say('Whoa! Jar full. That was loud and that was brave.', { expression: 'surprised' }) }
  }, [fill])
  return (
    <div className="card flex flex-col items-center p-6">
      <svg viewBox="0 0 120 160" width="150" height="200" aria-hidden>
        <defs><clipPath id="jar"><path d="M30 30h60v10c10 6 14 14 14 26v76a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10V66c0-12 4-20 14-26z" /></clipPath></defs>
        <g clipPath="url(#jar)">
          <rect x="0" y="0" width="120" height="160" fill="var(--paper-2)" />
          <motion.rect x="0" width="120" height="160" fill="var(--care)" animate={{ y: 152 - (fill / 100) * 115 }} />
        </g>
        <path d="M30 30h60v10c10 6 14 14 14 26v76a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10V66c0-12 4-20 14-26z" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
        <rect x="26" y="18" width="68" height="12" rx="4" fill="var(--ink)" />
      </svg>
      <p className="display mt-3 text-4xl">{Math.round(fill)}%</p>
      <p className="mt-1 text-center text-sm text-ink-soft">{fill >= 100 ? 'Jar full. Lid on. Feel any lighter?' : on ? 'Shout, sing, groan. Fill it up!' : 'Nothing is recorded, I only measure loudness.'}</p>
      <div className="mt-4 flex gap-2">
        {!on && fill < 100 && <button className="btn" onClick={start}>Open the jar</button>}
        {on && <button className="btn btn-ghost" onClick={() => stop.current()}>Close</button>}
        {fill >= 100 && <button className="btn btn-ghost" onClick={() => setFill(0)}>Empty it</button>}
      </div>
    </div>
  )
}

function Scribble() {
  const ref = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number; t: number } | null>(null)
  const [fade, setFade] = useState(false)
  useEffect(() => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    c.width = r.width * devicePixelRatio
    c.height = r.height * devicePixelRatio
  }, [])
  const draw = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return
    const c = ref.current!
    const g = c.getContext('2d')!
    const r = c.getBoundingClientRect()
    const x = (e.clientX - r.left) * devicePixelRatio
    const y = (e.clientY - r.top) * devicePixelRatio
    const now = performance.now()
    if (last.current) {
      const speed = Math.hypot(x - last.current.x, y - last.current.y) / Math.max(1, now - last.current.t)
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(speed > 2 ? '--care' : '--ink')
      g.lineWidth = Math.min(18, 2 + speed * 3) * devicePixelRatio
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(last.current.x, last.current.y)
      g.lineTo(x, y)
      g.stroke()
      if (speed > 3) navigator.vibrate?.(5)
    }
    last.current = { x, y, t: now }
  }
  const wipe = () => {
    setFade(true)
    cheer()
    setTimeout(() => {
      const c = ref.current!
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      setFade(false)
    }, 900)
  }
  return (
    <div className="card p-3">
      <canvas ref={ref} onPointerMove={draw} onPointerDown={(e) => { last.current = null; draw(e) }} onPointerUp={() => (last.current = null)} className={`h-80 w-full touch-none rounded-2xl bg-paper-2 transition-all duration-700 ${fade ? 'scale-95 opacity-0 blur-sm' : ''}`} />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-ink-soft">Faster strokes turn coral.</span>
        <button className="btn btn-ghost py-2" onClick={wipe}>Wipe it away</button>
      </div>
    </div>
  )
}
