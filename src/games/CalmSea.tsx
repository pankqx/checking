import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { hash, smooth, useAscii, type Frame } from './ascii'
import { buzz, Calm } from './sound'
import { SoundToggle } from './GameShell'

// "Calm the sea": the opening moment. The screen starts as a storm of noisy
// ASCII. Each glowing ball you tap sends out a ring of calm, and the noise
// settles into moonlit ocean waves that roll in at the pace of a slow breath.

const N = 5
const BALLS: { x: number; y: number; hue: string }[] = [
  { x: 24, y: 40, hue: '#a9c3f0' },
  { x: 70, y: 57, hue: '#aea3d4' },
  { x: 36, y: 68, hue: '#9fd3b4' },
  { x: 78, y: 79, hue: '#f2c48d' },
  { x: 20, y: 84, hue: '#e6b2a2' },
]
const STORM = '#%&@*+=?!/\\|<>'
// palette index: 1-3 storm, 4 star, 5 moon, 6 moon dim, 7 horizon, 8 far, 9 mid, 10 near, 11 crest, 12 moon path, 13 dim
const PALETTE = ['', '#555a7c', '#7a7fa6', '#a49ec9', '#d9dcff', '#d8cfa9', '#b9b08c', '#7581c2', '#5873ad', '#79a1d6', '#9cc8ec', '#e2f2fb', '#f3e7bd', '#3f5684']

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)))
/** One breath: 4 s in, 6 s out. Returns 0..1 and whether we are breathing in. */
export const breathAt = (t: number) => {
  const p = ((t % 10) + 10) % 10
  return p < 4 ? { b: ease(p / 4), inhale: true } : { b: 1 - ease((p - 4) / 6), inhale: false }
}

export default function CalmSea({ onDone, replay = false }: { onDone: () => void; replay?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const sound = useRef<Calm>(null)
  const sources = useRef<{ x: number; y: number; t0: number | null }[]>([])
  const clock = useRef({ t: 0, breath: 0, inhale: true })
  const calmG = useRef(0)
  const [popped, setPopped] = useState<boolean[]>(() => BALLS.map(() => false))
  const [rings, setRings] = useState<{ id: number; x: number; y: number; hue: string }[]>([])
  const [settled, setSettled] = useState(false)
  const [inhale, setInhale] = useState(true)
  const [muted, setMuted] = useState(false)
  const taps = popped.filter(Boolean).length

  useEffect(() => {
    const c = new Calm()
    sound.current = c
    setMuted(c.muted)
    return () => c.close()
  }, [])

  useEffect(() => {
    if (taps < N) return
    const id = setTimeout(() => setSettled(true), 2400)
    return () => clearTimeout(id)
  }, [taps])

  useEffect(() => {
    if (!settled) return
    const id = setInterval(() => setInhale(clock.current.inhale), 200)
    return () => clearInterval(id)
  }, [settled])

  const frame = ({ s, t, dt }: Frame) => {
    const { b, inhale } = breathAt(t)
    clock.current = { t, breath: b, inhale }
    const W = s.cols
    const H = s.rows
    const { cw, ch } = s
    const hz = Math.round(H * 0.5)
    const mx = s.w * 0.72
    const my = s.h * 0.36
    const mr = Math.max(30, s.w * 0.085)
    const diag = Math.hypot(s.w, s.h) + 90
    let full = 0
    const active: { x: number; y: number; r: number }[] = []
    for (const src of sources.current) {
      if (src.t0 == null) src.t0 = t
      const r = (t - src.t0) * 280
      if (r > diag) full++
      else active.push({ x: src.x, y: src.y, r })
    }
    calmG.current += ((sources.current.length / N) - calmG.current) * Math.min(1, dt * 0.9)
    const tick = Math.floor(t * 9)
    const textBand = H * 0.27
    for (let row = 0; row < H; row++) {
      const py = (row + 0.5) * ch
      const z = row > hz ? (row - hz) / (H - hz) : 0
      for (let col = 0; col < W; col++) {
        const px = (col + 0.5) * cw
        let C = full
        for (const a of active) C += smooth(0, 1, (a.r - Math.hypot(px - a.x, py - a.y)) / 80)
        C /= N
        let c = ' '
        let co = 0
        if (row < hz) {
          const dm = Math.hypot(px - mx, py - my)
          if (dm < mr + 8) {
            const hc = hash(col, row, 5)
            if (dm < mr * 0.85 && C > 0.3 && hc < 0.32) { c = hc < 0.12 ? 'o' : '.'; co = hc < 0.12 ? 6 : 5 }
          } else {
            const hs = hash(col, row, 7)
            if (hs < 0.035 * C) {
              const tw = 0.5 + 0.5 * Math.sin(t * 1.1 + hs * 900)
              c = tw > 0.8 ? '*' : tw > 0.4 ? '+' : '.'
              co = 4
            }
          }
        } else if (row === hz) {
          c = hash(col, 3) < 0.7 ? '-' : '_'
          co = 7
        } else {
          const k = 0.95 - 0.55 * z
          const w = 0.5 + 0.9 * z
          let v = 0.6 * Math.sin(col * k * 0.55 + t * w + row * 0.9) + 0.4 * Math.sin(col * k * 0.21 - t * w * 0.7 + row * 1.7)
          v += (b - 0.5) * 0.4 * z
          const roll = (((z * 2.2 - t * 0.22) % 1) + 1) % 1
          if (roll < 0.06 && v > -0.6) { c = '~'; co = 11 }
          else if (v > 0.32) { c = '~'; co = z < 0.25 ? 8 : z < 0.6 ? 9 : 10 }
          else if (v > -0.08) { c = '-'; co = z < 0.25 ? 8 : 9 }
          else if (v > -0.5) { c = '.'; co = 13 }
          if (co && Math.abs(px - mx) < (8 + z * 70) * (0.65 + 0.35 * Math.sin(t * 0.7 + row * 1.3))) {
            co = 12
            if (c === '-') c = '='
          }
        }
        let stormP = (1 - C) * (row < hz ? (row < textBand ? 0.05 : 0.5) : 0.82)
        if (row > hz) stormP *= 0.75 + 0.25 * Math.sin(col * 0.8 + t * 4 + row * 1.9)
        const hn = hash(col, row, tick)
        if (hn < stormP) {
          c = STORM[Math.floor(hash(row, col, tick + 1) * STORM.length)]
          co = 1 + Math.floor(hash(col, row, 3) * 3)
        }
        const i = row * W + col
        s.chars[i] = c
        s.col[i] = co
      }
    }
  }

  const under = ({ s, ctx, t }: Frame) => {
    const g = calmG.current
    const hzY = Math.round(s.rows * 0.5) * s.ch
    const sky = ctx.createLinearGradient(0, 0, 0, hzY)
    sky.addColorStop(0, '#0a0f2c')
    sky.addColorStop(0.7, '#20255e')
    sky.addColorStop(1, '#3d3474')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, s.w, hzY)
    const sea = ctx.createLinearGradient(0, hzY, 0, s.h)
    sea.addColorStop(0, '#141d4a')
    sea.addColorStop(1, '#0a1832')
    ctx.fillStyle = sea
    ctx.fillRect(0, hzY, s.w, s.h - hzY)
    const { b } = breathAt(t)
    const mx = s.w * 0.72
    const my = s.h * 0.36
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, s.w * 0.45)
    glow.addColorStop(0, `rgba(246,239,210,${(0.28 + 0.1 * b) * g})`)
    glow.addColorStop(1, 'rgba(246,239,210,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, s.w, s.h)
    const mr = Math.max(30, s.w * 0.085)
    const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr)
    disc.addColorStop(0, '#fffaf0')
    disc.addColorStop(1, '#efe4c2')
    ctx.globalAlpha = Math.min(1, g * 1.3)
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(mx, my, mr, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = `rgba(20,21,31,${0.88 * (1 - g)})`
    ctx.fillRect(0, 0, s.w, s.h)
  }

  useAscii(cv, { fontPx: 14, palette: () => PALETTE, frame, under })

  const pop = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (popped[i]) return
    const r = e.currentTarget.getBoundingClientRect()
    const o = box.current!.getBoundingClientRect()
    const x = r.left + r.width / 2 - o.left
    const y = r.top + r.height / 2 - o.top
    sources.current.push({ x, y, t0: null })
    setPopped((p) => p.map((v, k) => v || k === i))
    setRings((rs) => [...rs, { id: Date.now() + i, x, y, hue: BALLS[i].hue }])
    const n = taps
    sound.current?.chime(n)
    sound.current?.ocean((n + 1) / N)
    buzz(14)
  }

  const toggleSound = () => {
    const m = !muted
    setMuted(m)
    sound.current?.setMuted(m)
    if (!m) sound.current?.ocean(taps / N)
  }

  return (
    <motion.div
      ref={box}
      className="fixed inset-0 z-[100] overflow-hidden bg-[#0d1226] text-[#efeaf7]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.8 } }}
      exit={{ opacity: 0, transition: { duration: 1, ease: [0.22, 1, 0.36, 1] } }}
      role="dialog"
      aria-label="Calm the sea"
    >
      <canvas ref={cv} className="absolute inset-0" aria-hidden />

      <AnimatePresence>
        {rings.map((r) => (
          <motion.span
            key={r.id}
            className="pointer-events-none absolute size-16 rounded-full border-2"
            style={{ left: r.x - 32, top: r.y - 32, borderColor: r.hue }}
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 7, opacity: 0 }}
            transition={{ duration: 2.2, ease: 'easeOut' }}
            onAnimationComplete={() => setRings((rs) => rs.filter((x) => x.id !== r.id))}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {BALLS.map((b, i) => !popped[i] && (
          <motion.button
            key={i}
            onClick={(e) => pop(i, e)}
            aria-label={`Calm ball ${i + 1} of ${N}`}
            className="absolute grid size-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1, y: [0, -12, 0], x: [0, 7, 0] }}
            exit={{ opacity: 0, scale: 2.2, transition: { duration: 0.6 } }}
            transition={{ opacity: { duration: 1.2, delay: 0.6 + i * 0.25 }, scale: { duration: 1.2, delay: 0.6 + i * 0.25 }, y: { duration: 5 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }, x: { duration: 7 + i, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <span className="breathe absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${b.hue}55 0%, transparent 70%)`, ['--breathe-to' as string]: 1.25 }} />
            <span className="relative size-10 rounded-full" style={{ background: `radial-gradient(circle at 34% 30%, #fff 0, ${b.hue} 46%, color-mix(in oklab, ${b.hue} 60%, #2a2f6b) 100%)`, boxShadow: `0 0 26px ${b.hue}aa` }} />
          </motion.button>
        ))}
      </AnimatePresence>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <SoundToggle muted={muted} onToggle={toggleSound} />
        {!settled && (
          <button onClick={onDone} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20">
            {replay ? 'Close' : 'Skip'}
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34%] bg-[radial-gradient(90%_70%_at_50%_30%,rgba(13,18,38,.75),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[9%] px-6 text-center">
        <AnimatePresence mode="wait">
          {!settled ? (
            <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.9 }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">A moment to arrive</p>
              <h1 className="mt-2 font-[Fraunces] text-[34px] leading-tight italic">Calm the sea</h1>
              <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-white/75">
                {taps === 0 ? 'Your mind might feel a little stormy. Tap each glowing ball to settle the waves.' : taps < N ? 'Lovely. Keep going, one ball at a time.' : 'Listen. The storm is passing.'}
              </p>
              <div className="mt-4 flex justify-center gap-2" aria-hidden>
                {BALLS.map((b, i) => <span key={i} className="size-2 rounded-full transition-all duration-700" style={{ background: popped[i] ? b.hue : 'rgba(255,255,255,.22)', transform: popped[i] ? 'scale(1.3)' : undefined }} />)}
              </div>
            </motion.div>
          ) : (
            <motion.div key="b" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4 }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">The sea is calm</p>
              <h1 className="mt-2 font-[Fraunces] text-[32px] leading-tight italic">Breathe with the waves</h1>
              <p className="mx-auto mt-2 max-w-[19rem] text-[15px] leading-relaxed text-white/75">In as a wave rises, out as it rolls in.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="sr-only" aria-live="polite">{taps < N ? `${taps} of ${N} calm` : 'The sea is calm.'}</p>

      <AnimatePresence>
        {settled && (
          <motion.div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 px-6 pb-[max(28px,env(safe-area-inset-bottom))]" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.6 }}>
            <AnimatePresence mode="wait">
              <motion.p key={String(inhale)} className="font-[Fraunces] text-2xl italic text-white/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
                {inhale ? 'Breathe in…' : 'and slowly out…'}
              </motion.p>
            </AnimatePresence>
            <button onClick={onDone} className="w-full max-w-xs rounded-full bg-[#efeaf7] px-6 py-4 text-[15px] font-bold text-[#1c2150] shadow-[0_10px_40px_-12px_rgba(214,237,248,.6)] transition active:scale-[.98]">
              {replay ? 'Done' : 'Enter MindMirror'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
