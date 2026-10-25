import { useEffect, useRef, type RefObject } from 'react'

// A tiny ASCII renderer for the calm games: a grid of characters, each with a
// colour from a small palette, drawn to a canvas in runs of the same colour so
// a phone can keep up at an easy 30 frames a second.

export const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

export class Surface {
  cols = 0
  rows = 0
  cw = 8
  ch = 16
  w = 0
  h = 0
  chars: string[] = []
  col = new Uint8Array(0)

  resize(w: number, h: number, cw: number, ch: number) {
    this.w = w
    this.h = h
    this.cw = cw
    this.ch = ch
    this.cols = Math.max(1, Math.ceil(w / cw))
    this.rows = Math.max(1, Math.ceil(h / ch))
    this.chars = new Array(this.cols * this.rows).fill(' ')
    this.col = new Uint8Array(this.cols * this.rows)
  }

  clear() {
    this.chars.fill(' ')
    this.col.fill(0)
  }

  set(x: number, y: number, c: string, colour: number) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return
    const i = y * this.cols + x
    this.chars[i] = c
    this.col[i] = colour
  }

  text(x: number, y: number, s: string, colour: number) {
    for (let k = 0; k < s.length; k++) if (s[k] !== ' ') this.set(x + k, y, s[k], colour)
  }

  /** Cell under a point in CSS pixels. */
  cell(px: number, py: number) {
    return [Math.floor(px / this.cw), Math.floor(py / this.ch)] as const
  }

  render(ctx: CanvasRenderingContext2D, palette: string[], font: string) {
    ctx.font = font
    ctx.textBaseline = 'middle'
    const yOff = this.ch / 2
    for (let y = 0; y < this.rows; y++) {
      let x = 0
      while (x < this.cols) {
        const c = this.col[y * this.cols + x]
        if (c === 0) { x++; continue }
        let s = ''
        let k = x
        while (k < this.cols && (this.col[y * this.cols + k] === c || this.chars[y * this.cols + k] === ' ')) {
          s += this.chars[y * this.cols + k]
          k++
        }
        const trimmed = s.trimEnd()
        if (trimmed) {
          ctx.fillStyle = palette[c] ?? '#fff'
          ctx.fillText(trimmed, x * this.cw, y * this.ch + yOff)
        }
        x = k
      }
    }
  }
}

/** Cheap deterministic hash of two integers to 0..1. */
export const hash = (a: number, b: number, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Reads a colour token (e.g. "--paper") so a game follows the app's theme. */
export const token = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback } catch { return fallback }
}

/** True when the app is showing a dark palette (dark mode or the night garden). */
export const isDark = () => {
  const hex = token('--paper', '#f4efe7').replace('#', '')
  if (hex.length < 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return r * 0.299 + g * 0.587 + b * 0.114 < 110
}

export interface Frame {
  s: Surface
  ctx: CanvasRenderingContext2D
  t: number
  dt: number
}

/**
 * Runs an ASCII scene on a canvas that fills its parent. `frame` fills the
 * surface each tick; `under` may paint the canvas first (gradients, glows).
 */
export function useAscii(
  canvas: RefObject<HTMLCanvasElement | null>,
  opts: { fontPx?: number; lineH?: number; fps?: number; palette: () => string[]; frame: (f: Frame) => void; under?: (f: Frame) => void; onResize?: (s: Surface) => void },
) {
  const surface = useRef(new Surface())
  const o = useRef(opts)
  o.current = opts

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const s = surface.current
    const fontPx = o.current.fontPx ?? 14
    const font = `500 ${fontPx}px ${MONO}`
    let palette = o.current.palette()
    let raf = 0
    let last = 0
    let start = 0
    const fps = (o.current.fps ?? 30) * (reducedMotion() ? 0.5 : 1)

    const size = () => {
      const r = el.parentElement?.getBoundingClientRect() ?? el.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      el.width = Math.round(r.width * dpr)
      el.height = Math.round(r.height * dpr)
      el.style.width = `${r.width}px`
      el.style.height = `${r.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = font
      const cw = ctx.measureText('M').width || fontPx * 0.6
      s.resize(r.width, r.height, cw, Math.round(fontPx * (o.current.lineH ?? 1.3)))
      palette = o.current.palette()
      o.current.onResize?.(s)
    }
    size()
    const ro = new ResizeObserver(size)
    if (el.parentElement) ro.observe(el.parentElement)
    document.fonts?.load(font).then(size).catch(() => {})

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!start) start = now
      if (now - last < 1000 / fps - 2) return
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / fps
      last = now
      const f: Frame = { s, ctx, t: (now - start) / 1000, dt }
      ctx.clearRect(0, 0, s.w, s.h)
      o.current.under?.(f)
      o.current.frame(f)
      s.render(ctx, palette, font)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [canvas])

  return surface
}
