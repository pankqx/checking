import { useEffect, useRef, useState } from 'react'
import { hash, isDark, useAscii, type Frame } from './ascii'
import { GameChip, GameShell } from './GameShell'
import { buzz, Calm } from './sound'

// "Ripples": a koi pond seen from above, drawn in ASCII. Tap or trail a finger
// to make ripples and watch them spread and fade, like a passing thought.
// Gentle rain lets the pond play by itself.

const LIGHT = ['', '#a9bfcd', '#8fadc1', '#6f97b5', '#3f6f98', '#1f4b73', '#d9774f', '#c98f1e', '#5f8f5a', '#d9839a', '#b85c7a']
const DARK = ['', '#1f3657', '#2b4a72', '#41709e', '#78a6d2', '#d2e6f7', '#f0a07c', '#edc165', '#5f8f6a', '#e6a6b8', '#f2ece0']
const PADS = [[0.18, 0.34, 30], [0.8, 0.6, 34], [0.3, 0.8, 26]] as const

interface Ripple { x: number; y: number; t0: number | null; amp: number }
interface Koi { ph: number; cx: number; cy: number; ax: number; ay: number; w: number; off: number; boost: number; colour: number }

export default function Ripples({ onClose }: { onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const sound = useRef<Calm>(null)
  const ripples = useRef<Ripple[]>([])
  const now = useRef(0)
  const nextRain = useRef(0)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [dark] = useState(isDark)
  const [rain, setRain] = useState(false)
  const rainRef = useRef(false)
  rainRef.current = rain
  const [muted, setMuted] = useState(false)
  const koi = useRef<Koi[]>([
    { ph: 0, cx: 0.5, cy: 0.5, ax: 0.32, ay: 0.18, w: 0.16, off: 0.4, boost: 0, colour: 6 },
    { ph: 2, cx: 0.45, cy: 0.62, ax: 0.28, ay: 0.14, w: 0.12, off: 1.7, boost: 0, colour: 7 },
    { ph: 4, cx: 0.55, cy: 0.42, ax: 0.22, ay: 0.2, w: 0.1, off: 2.9, boost: 0, colour: 10 },
  ])

  useEffect(() => {
    const c = new Calm()
    sound.current = c
    setMuted(c.muted)
    return () => c.close()
  }, [])

  const add = (x: number, y: number, amp: number) => {
    ripples.current.push({ x, y, t0: null, amp })
    if (ripples.current.length > 28) ripples.current.shift()
  }

  const frame = ({ s, t, dt }: Frame) => {
    now.current = t
    const { cw, ch } = s
    if (rainRef.current && t > nextRain.current) {
      add(Math.random() * s.w, s.h * (0.22 + Math.random() * 0.7), 0.5 + Math.random() * 0.25)
      sound.current?.drop(0.04)
      nextRain.current = t + 0.5 + Math.random() * 1.1
    }
    const live: { x: number; y: number; r: number; e: number; age: number }[] = []
    ripples.current = ripples.current.filter((r) => {
      if (r.t0 == null) r.t0 = t
      const age = t - r.t0
      const e = r.amp * Math.exp(-age * 0.42) * Math.min(1, age * 8 + 0.2)
      if (e < 0.04) return false
      live.push({ x: r.x, y: r.y, r: age * 115, e, age })
      return true
    })
    for (let row = 0; row < s.rows; row++) {
      const py = (row + 0.5) * ch
      for (let col = 0; col < s.cols; col++) {
        const px = (col + 0.5) * cw
        let h = 0
        for (const r of live) {
          const x = Math.hypot(px - r.x, py - r.y) - r.r
          if (x > 30 || x < -80) continue
          h += r.e * Math.exp(-(x * x) / (x > 0 ? 140 : 650)) * Math.cos(x * 0.24)
        }
        let c = ' '
        let co = 0
        if (h > 0.62) { c = 'O'; co = 5 }
        else if (h > 0.4) { c = 'o'; co = 5 }
        else if (h > 0.22) { c = ':'; co = 4 }
        else if (h > 0.1) { c = '.'; co = 3 }
        else if (h > -0.18) {
          const v = Math.sin(col * 0.31 + t * 0.35) * Math.sin(row * 0.47 - t * 0.27) + 0.6 * Math.sin((col + row * 1.3) * 0.17 + t * 0.22)
          if (v > 1.3) { c = '~'; co = 2 }
          else if (hash(col, row, Math.floor(t * 0.4 + hash(row, col) * 9)) < 0.035) { c = '.'; co = 1 }
        }
        const i = row * s.cols + col
        s.chars[i] = c
        s.col[i] = co
      }
    }
    // koi swim under the lily pads; ripples startle them for a moment
    for (const k of koi.current) {
      const kx = (k.cx + k.ax * Math.sin(k.ph)) * s.w
      const ky = (k.cy + k.ay * Math.sin(2 * k.ph + k.off)) * s.h
      for (const r of live) if (r.age < 1.5 && Math.abs(Math.hypot(kx - r.x, ky - r.y) - r.r) < 30) k.boost = Math.min(4, k.boost + r.e * 0.6)
      k.boost *= Math.pow(0.35, dt)
      k.ph += dt * k.w * (1 + k.boost)
      const right = Math.cos(k.ph) > 0
      const body = right ? "><(('>" : "<'))><"
      const [cx, cy] = s.cell(kx, ky)
      s.text(cx - 3, cy, body, k.colour)
    }
    for (const [fx, fy, rad] of PADS) {
      const ox = fx * s.w
      const oy = fy * s.h + Math.sin(t * 0.5 + fx * 9) * 2
      for (let row = Math.floor((oy - rad) / ch); row <= Math.ceil((oy + rad) / ch); row++) {
        for (let col = Math.floor((ox - rad) / cw); col <= Math.ceil((ox + rad) / cw); col++) {
          const dx = (col + 0.5) * cw - ox
          const dy = (row + 0.5) * ch - oy
          const d = Math.hypot(dx, dy)
          if (d > rad) continue
          const a = Math.atan2(dy, dx)
          if (Math.abs(a - 0.6) < 0.32 && d > rad * 0.15) continue
          s.set(col, row, d > rad * 0.78 ? 'o' : '%', 8)
        }
      }
      if (rad > 30) { const [cx, cy] = s.cell(ox - 4, oy - 2); s.text(cx - 1, cy, '*@*', 9) }
    }
  }

  const under = ({ s, ctx }: Frame) => {
    const g = ctx.createRadialGradient(s.w / 2, s.h * 0.55, 20, s.w / 2, s.h * 0.55, Math.max(s.w, s.h) * 0.75)
    g.addColorStop(0, dark ? '#14294b' : '#e4eef3')
    g.addColorStop(1, dark ? '#09142a' : '#c7dae4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s.w, s.h)
  }

  const surface = useAscii(cv, { fontPx: 14, palette: () => (dark ? DARK : LIGHT), frame, under })

  const point = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent) => {
    const p = point(e)
    last.current = p
    add(p.x, p.y, 1)
    sound.current?.drop()
    buzz(8)
  }
  const move = (e: React.PointerEvent) => {
    if (!last.current) return
    const p = point(e)
    if (Math.hypot(p.x - last.current.x, p.y - last.current.y) < (surface.current.cw || 8) * 6) return
    last.current = p
    add(p.x, p.y, 0.55)
  }
  const up = () => { last.current = null }

  const toggleSound = () => { const m = !muted; setMuted(m); sound.current?.setMuted(m) }

  return (
    <GameShell
      title="Ripples"
      hint="Tap the pond, or trail a finger. Watch each ripple spread and fade, like a passing thought."
      dark={dark}
      bg={dark ? '#0c1932' : '#d3e3ea'}
      muted={muted}
      onToggleSound={toggleSound}
      onClose={onClose}
      controls={<GameChip dark={dark} on={rain} onClick={() => { setRain((r) => !r); nextRain.current = now.current }}>{rain ? 'Gentle rain: on' : 'Gentle rain'}</GameChip>}
    >
      <div className="absolute inset-0 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        <canvas ref={cv} className="absolute inset-0" aria-hidden />
      </div>
    </GameShell>
  )
}
