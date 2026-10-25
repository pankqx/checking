import { animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, type RefObject } from 'react'
import { setUi, useBuddy, type UiMode } from '../lib/buddy'

const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Grandeur backdrop: three drifting aurora fields + a firefly canvas. */
export function Atmosphere() {
  const { ui } = useBuddy()
  if (ui !== 'grandeur') return null
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <Fireflies />
    </div>
  )
}

function Fireflies() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (reduced()) return
    const c = ref.current!
    const g = c.getContext('2d')!
    const dpr = Math.min(2, devicePixelRatio)
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr }
    resize()
    addEventListener('resize', resize)
    const N = innerWidth < 600 ? 26 : 48
    const colors = ['#9fd3b4', '#aea3d4', '#f2cd7a', '#a9c3f0', '#f3f0ff']
    const flies = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, p: Math.random() * 6.28, s: 0.2 + Math.random() * 0.6, c: colors[Math.floor(Math.random() * colors.length)] }))
    let px = 0, py = 0
    const mv = (e: PointerEvent) => { px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5 }
    addEventListener('pointermove', mv)
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const t = (now - t0) / 1000
      g.clearRect(0, 0, c.width, c.height)
      for (const f of flies) {
        const x = ((f.x + Math.sin(t * 0.05 * f.s + f.p) * 0.06 + px * f.r * 0.01) % 1) * c.width
        const y = ((f.y - t * 0.006 * f.s + 10) % 1) * c.height + py * f.r * 6
        const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * f.s * 1.6 + f.p))
        g.globalAlpha = a
        g.fillStyle = f.c
        g.shadowColor = f.c
        g.shadowBlur = 12 * dpr
        g.beginPath()
        g.arc(x, y, f.r * dpr, 0, 6.283)
        g.fill()
      }
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', mv) }
  }, [])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />
}

/** Minimal ⇄ Grandeur switch. */
export function ModeToggle({ className = '' }: { className?: string }) {
  const { ui } = useBuddy()
  const opt = (m: UiMode, label: string) => (
    <button onClick={() => setUi(m)} className={`relative z-10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${ui === m ? 'text-paper' : 'text-ink-soft'}`} aria-pressed={ui === m}>
      {ui === m && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-full" style={{ background: m === 'grandeur' ? 'linear-gradient(120deg, var(--pista), var(--neel) 55%, var(--haldi))' : 'var(--ink)' }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
      {label}
    </button>
  )
  return (
    <div className={`inline-flex rounded-full border border-line bg-card p-0.5 backdrop-blur ${className}`}>
      {opt('minimal', 'Minimal')}
      {opt('grandeur', 'Grandeur')}
    </div>
  )
}

/** Coverflow for a horizontal snap row: cards tilt and scale by distance from centre. */
export function useCoverflow(ref: RefObject<HTMLElement | null>, strength = 1) {
  useEffect(() => {
    const el = ref.current
    if (!el || reduced()) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const mid = r.left + r.width / 2
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const c = child.getBoundingClientRect()
        const d = Math.max(-1.4, Math.min(1.4, (c.left + c.width / 2 - mid) / r.width))
        child.style.transform = `perspective(900px) rotateY(${(-d * 24 * strength).toFixed(2)}deg) scale(${(1 - Math.abs(d) * 0.1 * strength).toFixed(3)}) translateZ(0)`
        child.style.opacity = String(1 - Math.min(0.45, Math.abs(d) * 0.35 * strength))
      }
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    el.addEventListener('scroll', on, { passive: true })
    addEventListener('resize', on)
    return () => { el.removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [ref, strength])
}

/** Number that counts up when it scrolls into view. */
export function CountUp({ to, decimals = 0, className = '' }: { to: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const v = useMotionValue(0)
  const text = useTransform(v, (x) => x.toFixed(decimals))
  useEffect(() => {
    if (!inView) return
    const a = animate(v, to, { duration: reduced() ? 0 : 1.4, ease: [0.2, 0.8, 0.2, 1] })
    return () => a.stop()
  }, [inView, to, v])
  return <motion.span ref={ref} className={className}>{text}</motion.span>
}

/** Words that rise in one by one. */
export function RiseText({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <motion.span className="rise-word inline-block" initial={{ y: '110%', rotate: 6 }} animate={{ y: 0, rotate: 0 }} transition={{ delay: delay + i * 0.06, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/** Shared page entrance: soft rise in Minimal, an iris reveal in Grandeur. */
export function usePageMotion() {
  const { ui } = useBuddy()
  // Only opacity and transform move, so the change of screen stays smooth on
  // a phone; the old screen leaves quickly and the new one settles slowly.
  const calm = [0.22, 1, 0.36, 1] as const
  if (reduced()) return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.3 } }
  if (ui === 'grandeur')
    return {
      initial: { opacity: 0, scale: 0.975, y: 10 },
      animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.8, ease: calm } },
      exit: { opacity: 0, scale: 0.99, transition: { duration: 0.22, ease: 'easeIn' as const } },
    }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: calm } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.2, ease: 'easeIn' as const } },
  }
}
