import { useEffect, useRef, useState } from 'react'
import { hash, isDark, useAscii, type Frame, type Surface } from './ascii'
import { GameChip, GameShell } from './GameShell'
import { buzz, Calm } from './sound'

// "Zen garden": rake lines into ASCII sand and set stones with rings around
// them. Slow, repetitive, and nothing can go wrong; smooth the sand any time.

// mark codes: 0 sand, 1-4 grooves (- \ | /), 5 ridge, 6 stone core, 7 stone edge
const GROOVE = ['-', '\\', '|', '/']
const LIGHT = ['', '#cbbd9f', '#a8977a', '#7f6e52', '#5f5a52', '#8b857a', '#87a07a']
const DARK = ['', '#3b362e', '#7d715f', '#c1b091', '#d6d0c4', '#9c9588', '#7f9c74']
const SAVE = 'mm-garden'

/** Groove character for a direction of travel on screen. */
const grooveFor = (dx: number, dy: number) => {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI
  a = ((a % 180) + 180) % 180
  return a < 22.5 || a >= 157.5 ? 1 : a < 67.5 ? 2 : a < 112.5 ? 3 : 4
}

export default function ZenGarden({ onClose }: { onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const sound = useRef<Calm>(null)
  const marks = useRef(new Uint8Array(0))
  const fresh = useRef(new Float32Array(0))
  const now = useRef(0)
  const wipe = useRef<number | null>(null)
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; t: number; moved: number } | null>(null)
  const [dark] = useState(isDark)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const c = new Calm()
    sound.current = c
    setMuted(c.muted)
    return () => { c.close(); save() }
  }, [])

  const s0 = () => surface.current
  const idx = (col: number, row: number) => (col < 0 || row < 0 || col >= s0().cols || row >= s0().rows ? -1 : row * s0().cols + col)
  const mark = (col: number, row: number, code: number) => {
    const i = idx(col, row)
    if (i < 0 || marks.current[i] >= 6) return
    marks.current[i] = code
    fresh.current[i] = now.current
  }

  const save = () => {
    try {
      const s = s0()
      localStorage.setItem(SAVE, JSON.stringify({ c: s.cols, r: s.rows, m: btoa(String.fromCharCode(...marks.current)) }))
    } catch { /* storage may be unavailable */ }
  }

  const stone = (x: number, y: number, quiet = false) => {
    const s = s0()
    const rs = 15
    const outer = rs + 50
    for (let row = Math.floor((y - outer) / s.ch); row <= Math.ceil((y + outer) / s.ch); row++) {
      for (let col = Math.floor((x - outer) / s.cw); col <= Math.ceil((x + outer) / s.cw); col++) {
        const i = idx(col, row)
        if (i < 0 || marks.current[i] >= 6) continue
        const dx = (col + 0.5) * s.cw - x
        const dy = (row + 0.5) * s.ch - y
        const d = Math.hypot(dx, dy)
        if (d > outer) continue
        if (d < rs) { marks.current[i] = d < rs * 0.6 ? 6 : 7; fresh.current[i] = now.current; continue }
        const ext = (Math.abs(dx) / (d || 1)) * s.cw + (Math.abs(dy) / (d || 1)) * s.ch
        const ring = [rs + 15, rs + 30, rs + 45].some((r) => Math.abs(d - r) < ext * 0.5)
        mark(col, row, ring ? grooveFor(-dy, dx) : 5)
      }
    }
    if (!quiet) { sound.current?.tock(); buzz(18) }
  }

  const pattern = (s: Surface) => {
    marks.current = new Uint8Array(s.cols * s.rows)
    fresh.current = new Float32Array(s.cols * s.rows).fill(-99)
    const top = Math.floor(s.rows * 0.24)
    for (let row = top; row < s.rows - 3; row++) for (let col = 1; col < s.cols - 1; col++) marks.current[row * s.cols + col] = (row - top) % 2 === 0 ? 1 : 5
    stone(s.w * 0.3, s.h * 0.46, true)
    stone(s.w * 0.7, s.h * 0.7, true)
    fresh.current.fill(-99)
  }

  const onResize = (s: Surface) => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE) ?? 'null')
      if (saved && saved.c === s.cols && saved.r === s.rows) {
        marks.current = Uint8Array.from(atob(saved.m), (ch) => ch.charCodeAt(0))
        fresh.current = new Float32Array(s.cols * s.rows).fill(-99)
        return
      }
    } catch { /* fall through to a fresh pattern */ }
    pattern(s)
  }

  const frame = ({ s, t }: Frame) => {
    now.current = t
    if (marks.current.length !== s.cols * s.rows) pattern(s)
    let front = -1
    if (wipe.current != null) {
      front = Math.floor(((t - wipe.current) / 1.6) * (s.cols + 4))
      for (let row = 0; row < s.rows; row++) for (let col = 0; col < Math.min(front, s.cols); col++) {
        const i = row * s.cols + col
        if (marks.current[i] && marks.current[i] < 6) { marks.current[i] = 0; fresh.current[i] = -99 }
      }
      if (front > s.cols + 2) { wipe.current = null; save() }
    }
    for (let row = 0; row < s.rows; row++) {
      for (let col = 0; col < s.cols; col++) {
        const i = row * s.cols + col
        const m = marks.current[i]
        const age = t - fresh.current[i]
        let c = ' '
        let co = 0
        if (m >= 1 && m <= 4) { c = GROOVE[m - 1]; co = age < 1.4 ? 3 : 2 }
        else if (m === 6) { c = '@'; co = 4 }
        else if (m === 7) { c = '#'; co = 5 }
        else if (m === 0) {
          const h = hash(col, row, 11)
          if (h < 0.1) { c = h < 0.03 ? ',' : '.'; co = 1 }
          else if (h > 0.996) { c = '"'; co = 6 }
        }
        if (col === front || col === front - 1) { c = '|'; co = 3 }
        s.chars[i] = c
        s.col[i] = co
      }
    }
  }

  const under = ({ s, ctx }: Frame) => {
    const g = ctx.createLinearGradient(0, 0, 0, s.h)
    g.addColorStop(0, dark ? '#1f1d19' : '#f1e9d8')
    g.addColorStop(1, dark ? '#141310' : '#e5d9c1')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s.w, s.h)
  }

  const surface = useAscii(cv, { fontPx: 14, palette: () => (dark ? DARK : LIGHT), frame, under, onResize })

  const point = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const rake = (x0: number, y0: number, x1: number, y1: number) => {
    const s = s0()
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    if (len < 0.5) return
    const g = grooveFor(dx, dy)
    const nx = -dy / len
    const ny = dx / len
    const step = Math.abs(nx) * s.cw + Math.abs(ny) * s.ch
    const n = Math.ceil(len / (s.cw * 0.5))
    for (let k = 0; k <= n; k++) {
      const px = x0 + (dx * k) / n
      const py = y0 + (dy * k) / n
      for (let tine = -3; tine <= 3; tine++) {
        const [col, row] = s.cell(px + nx * step * tine, py + ny * step * tine)
        mark(col, row, tine % 2 ? g : 5)
      }
    }
  }
  const down = (e: React.PointerEvent) => {
    const p = point(e)
    drag.current = { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    const dist = Math.hypot(p.x - d.x, p.y - d.y)
    if (dist < 3) return
    d.moved += dist
    if (d.moved > 10) {
      rake(d.x, d.y, p.x, p.y)
      const dtms = Math.max(8, performance.now() - d.t)
      sound.current?.sand((dist / dtms) * 1000)
    }
    d.x = p.x
    d.y = p.y
    d.t = performance.now()
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    sound.current?.sand(0)
    if (!d) return
    if (d.moved <= 10) stone(d.sx, d.sy)
    save()
  }

  const toggleSound = () => { const m = !muted; setMuted(m); sound.current?.setMuted(m) }

  return (
    <GameShell
      title="Zen garden"
      hint="Drag to rake the sand. Tap to set a stone. Nothing here can go wrong."
      dark={dark}
      bg={dark ? '#1f1d19' : '#f1e9d8'}
      muted={muted}
      onToggleSound={toggleSound}
      onClose={onClose}
      controls={
        <>
          <GameChip dark={dark} onClick={() => { wipe.current = now.current; sound.current?.sand(900); setTimeout(() => sound.current?.sand(0), 1400) }}>Smooth the sand</GameChip>
          <GameChip dark={dark} onClick={() => { pattern(s0()); save() }}>Fresh pattern</GameChip>
        </>
      }
    >
      <div className="absolute inset-0 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <canvas ref={cv} className="absolute inset-0" aria-hidden />
      </div>
    </GameShell>
  )
}
