import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react'
import { mouth } from '../lib/buddy'
import type { CharacterConfig, CharState, Expression } from './characters'

/**
 * Big hand-drawn ink characters (original designs, drawn in code).
 * Swap point: when generated portrait frames exist, set avatar.kind = 'frames' (docs/ASSETS.md).
 * Animation runs in one rAF loop that writes attributes directly — React never re-renders per frame.
 */
interface Props {
  config: CharacterConfig
  state: CharState
  expression?: Expression
  /** css height; width follows the 600x900 viewBox */
  height?: number | string
  className?: string
  /** follow the pointer with eyes/head */
  track?: boolean
  label?: string
}
export interface InkHandle { svg: SVGSVGElement | null }

const INK = '#0d0e0d'
const SKIN = '#ece7da'
const CLOTH = '#171918'

const eyeAlmond = (x: number, y: number, w = 34) => `M${x - w} ${y} Q${x} ${y - 24} ${x + w} ${y} Q${x} ${y + 19} ${x - w} ${y} Z`

function Eye({ x, y, lashes, id }: { x: number; y: number; lashes: boolean; id: string }) {
  return (
    <g>
      <clipPath id={`${id}-clip-${x}`}><path d={eyeAlmond(x, y)} /></clipPath>
      <path d={eyeAlmond(x, y)} fill="#f6f2e8" />
      <g clipPath={`url(#${id}-clip-${x})`}>
        <g data-part="pupil">
          <circle cx={x} cy={y} r={14} fill="#2a2b2a" />
          <circle cx={x} cy={y} r={14} fill={`url(#${id}-iris)`} />
          <circle cx={x} cy={y} r={6.5} fill={INK} />
          <circle cx={x - 5} cy={y - 5} r={3.4} fill="#fff" />
        </g>
        <path data-part="lid" d={`M${x - 40} ${y - 26} H${x + 40} V${y + 22} H${x - 40} Z`} fill={SKIN} style={{ transformBox: 'fill-box', transformOrigin: 'top', transform: 'scaleY(0)' }} />
      </g>
      <path d={`M${x - 37} ${y + 1} Q${x} ${y - 26} ${x + 37} ${y - 1}`} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
      <path d={`M${x - 26} ${y + 12} Q${x} ${y + 21} ${x + 26} ${y + 11}`} fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1.6} />
      {lashes && (
        <g stroke={INK} strokeWidth={2.4} strokeLinecap="round">
          {x < 300
            ? <><path d={`M${x - 35} ${y - 1} l-9 -7`} /><path d={`M${x - 30} ${y - 7} l-7 -9`} /><path d={`M${x - 22} ${y - 12} l-4 -10`} /></>
            : <><path d={`M${x + 35} ${y - 1} l9 -7`} /><path d={`M${x + 30} ${y - 7} l7 -9`} /><path d={`M${x + 22} ${y - 12} l4 -10`} /></>}
        </g>
      )}
    </g>
  )
}

function Defs({ id, accent }: { id: string; accent: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="7" stroke={INK} strokeWidth="2.2" />
      </pattern>
      <pattern id={`${id}-cross`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1.8" />
      </pattern>
      <pattern id={`${id}-cloth`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <line x1="0" y1="0" x2="0" y2="9" stroke="#3a3d39" strokeWidth="1.4" />
      </pattern>
      <pattern id={`${id}-stipple`} width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="3" r="1.1" fill={INK} /><circle cx="6.5" cy="7" r="0.9" fill={INK} /><circle cx="7" cy="1.5" r="0.7" fill={INK} />
      </pattern>
      <radialGradient id={`${id}-iris`}>
        <stop offset="0.45" stopColor={accent} stopOpacity="0" />
        <stop offset="1" stopColor={accent} stopOpacity="0.55" />
      </radialGradient>
      <radialGradient id={`${id}-halo`} cx="0.5" cy="0.45" r="0.5">
        <stop offset="0" stopColor={accent} stopOpacity="0.22" />
        <stop offset="1" stopColor={accent} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-shadeR`} x1="0" x2="1">
        <stop offset="0.48" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.95" stopColor="#fff" stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${id}-shadeL`} x1="1" x2="0">
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.95" stopColor="#fff" stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${id}-shadeTop`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={`${id}-mR`}><rect width="600" height="900" fill={`url(#${id}-shadeR)`} /></mask>
      <mask id={`${id}-mL`}><rect width="600" height="900" fill={`url(#${id}-shadeL)`} /></mask>
      <mask id={`${id}-mTop`}><rect x="0" y="200" width="600" height="500" fill={`url(#${id}-shadeTop)`} /></mask>
      <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="7" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id={`${id}-grain`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  )
}

function Mouth({ id }: { id: string }) {
  return (
    <g data-part="mouth">
      <ellipse data-part="mouth-in" cx="300" cy="563" rx="21" ry="0.1" fill={INK} />
      <path data-part="lip-low" d="M268 561 Q300 574 332 561" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path data-part="lip-up" d="M266 561 Q284 552 300 556 Q316 552 334 561" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <g data-part="dimples" opacity="0" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round"><path d="M252 548 Q256 556 254 564" /><path d="M348 548 Q344 556 346 564" /></g>
      <path d="M284 584 Q300 590 316 584" fill="none" stroke={INK} strokeOpacity="0.3" strokeWidth="2" />
      <title>{id ? '' : ''}</title>
    </g>
  )
}

/* ------------------------------ REENU ------------------------------ */
const GOLD = '#e8b54a'
const SKIN2 = '#f2dcc6'
function Reenu({ id, accent }: { id: string; accent: string }) {
  const face = 'M300 262 C366 262 404 326 404 418 C404 506 372 580 334 614 C318 628 282 628 266 614 C228 580 196 506 196 418 C196 326 234 262 300 262 Z'
  return (
    <>
      <ellipse cx="300" cy="430" rx="300" ry="390" fill={`url(#${id}-halo)`} />
      {/* long open hair, behind everything */}
      <g data-part="head">
        <path data-part="sway" d="M300 196 C182 196 150 300 152 420 C150 560 128 700 104 900 L496 900 C472 700 450 560 448 420 C450 300 418 196 300 196 Z" fill="#141615" />
        <g data-part="sway" fill="none" stroke="#3b3e3b" strokeWidth="1.6" opacity="0.9">
          <path d="M170 380 C164 540 150 700 132 880" /><path d="M190 420 C184 580 176 720 168 890" /><path d="M430 380 C436 540 450 700 468 880" /><path d="M410 420 C416 580 424 720 432 890" />
        </g>
      </g>
      {/* body: coral blouse + saree pallu with gold border */}
      <path d="M40 900 C52 806 104 748 178 728 C226 716 260 712 300 713 C340 712 374 716 422 728 C496 748 548 806 560 900 Z" fill="#c9465a" />
      <path d="M40 900 C52 806 104 748 178 728 C226 716 260 712 300 713 C340 712 374 716 422 728 C496 748 548 806 560 900 Z" fill={`url(#${id}-cloth)`} opacity="0.5" />
      <path d="M232 716 C250 770 280 790 300 792 C320 790 350 770 368 716" fill={SKIN2} />
      <path d="M232 716 C250 770 280 790 300 792 C320 790 350 770 368 716" fill="none" stroke={GOLD} strokeWidth="6" strokeDasharray="2 7" strokeLinecap="round" />
      <path d="M232 716 C250 770 280 790 300 792 C320 790 350 770 368 716" fill="none" stroke={GOLD} strokeWidth="2" />
      {/* pallu over her left shoulder */}
      <path d="M392 722 C430 730 470 742 500 770 L380 900 L300 900 Z" fill="#e8707f" />
      <path d="M500 770 L380 900" stroke={GOLD} strokeWidth="10" />
      <path d="M392 722 L300 900" stroke={GOLD} strokeWidth="5" opacity="0.8" />
      <g fill={GOLD} opacity="0.85">{[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={470 - i * 20} cy={800 + i * 18} r="3" />)}</g>
      {/* neck + chain */}
      <path d="M266 600 L262 720 Q300 744 338 720 L334 600 Z" fill={SKIN2} />
      <path d="M266 600 L262 720 Q300 744 338 720 L334 600 Z" fill={`url(#${id}-hatch)`} opacity="0.45" />
      <path d="M262 712 Q300 760 338 712" fill="none" stroke={GOLD} strokeWidth="2.4" />
      <circle cx="300" cy="742" r="5" fill={GOLD} />
      <g data-part="head">
        <path d={face} fill={SKIN2} />
        <g mask={`url(#${id}-mR)`}><path d={face} fill={`url(#${id}-hatch)`} opacity="0.55" /></g>
        <path d={face} fill="none" stroke={INK} strokeWidth="2.3" />
        {/* blush */}
        <ellipse cx="246" cy="492" rx="26" ry="13" fill={accent} opacity="0.28" />
        <ellipse cx="354" cy="492" rx="26" ry="13" fill={accent} opacity="0.28" />
        {/* brows: thin arches */}
        <path data-part="brow-l" d="M212 396 Q244 374 282 388" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <path data-part="brow-r" d="M318 388 Q356 374 388 396" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <Eye x={250} y={436} lashes id={id} />
        <Eye x={350} y={436} lashes id={id} />
        {/* eyeliner wings */}
        <path d="M214 434 L200 424" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M386 434 L400 424" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        {/* nose */}
        <path d="M301 448 C299 474 291 494 294 505 C299 511 308 510 313 505" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        {/* lips (coral) */}
        <path d="M268 561 Q284 551 300 556 Q316 551 332 561 Q300 580 268 561 Z" fill={accent} opacity="0.85" />
        <Mouth id="" />
        {/* centre-parted front hair framing the face */}
        <g data-part="sway">
          <path d="M300 214 C238 214 200 268 192 340 C186 400 188 470 178 560 C170 640 160 720 168 820 Q190 790 204 760 C200 640 206 520 214 420 C220 352 250 290 300 252 Z" fill="#181a19" />
          <path d="M300 214 C362 214 400 268 408 340 C414 400 412 470 422 560 C430 640 440 720 432 820 Q410 790 396 760 C400 640 394 520 386 420 C380 352 350 290 300 252 Z" fill="#181a19" />
          <g fill="none" stroke="#454845" strokeWidth="1.4">
            <path d="M296 222 C250 240 214 300 206 380" /><path d="M304 222 C350 240 386 300 394 380" /><path d="M196 460 C190 560 178 650 166 730" /><path d="M404 460 C410 560 422 650 434 730" />
          </g>
        </g>
        {/* jhumkas */}
        {[[196, 520], [404, 520]].map(([x, y]) => (
          <g key={x} data-part="jhumka">
            <circle cx={x} cy={y} r="6" fill={GOLD} />
            <path d={`M${x - 16} ${y + 34} Q${x} ${y + 2} ${x + 16} ${y + 34} Z`} fill={GOLD} stroke="#8a6420" strokeWidth="1.5" />
            {[-12, -6, 0, 6, 12].map((dx) => <circle key={dx} cx={x + dx} cy={y + 40} r="2.6" fill={GOLD} />)}
          </g>
        ))}
      </g>
      {/* rim light */}
      <path d="M300 198 C190 198 152 300 152 420 C150 560 128 700 106 896" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" filter={`url(#${id}-glow)`} />
      <path d="M404 418 C404 506 374 578 336 612" fill="none" stroke="#ffd60a" strokeWidth="2.4" opacity="0.8" filter={`url(#${id}-glow)`} />
    </>
  )
}

/* ------------------------------ ROMAN ------------------------------ */
const curls: [number, number, number][] = [[188, 330, 30], [200, 280, 36], [228, 236, 38], [268, 205, 40], [312, 196, 42], [356, 210, 40], [392, 246, 36], [414, 292, 32], [420, 336, 26], [244, 270, 30], [300, 240, 34], [350, 260, 30], [282, 280, 26], [326, 286, 24]]

function Roman({ id, accent }: { id: string; accent: string }) {
  const face = 'M300 248 C376 248 416 318 416 422 C416 516 386 590 346 626 C326 642 274 642 254 626 C214 590 184 516 184 422 C184 318 224 248 300 248 Z'
  return (
    <>
      <ellipse cx="300" cy="420" rx="300" ry="380" fill={`url(#${id}-halo)`} />
      {/* body: tee + open overshirt */}
      <path d="M24 900 C34 796 96 738 176 718 C226 706 256 702 300 703 C344 702 374 706 424 718 C504 738 566 796 576 900 Z" fill="#232523" />
      <path d="M24 900 C34 796 96 738 176 718 C226 706 256 702 300 703 C344 702 374 706 424 718 C504 738 566 796 576 900 Z" fill={`url(#${id}-cloth)`} />
      <path d="M214 714 L262 900 L338 900 L386 714 C360 706 330 703 300 703 C270 703 240 706 214 714 Z" fill={CLOTH} />
      <path d="M244 708 Q300 760 356 708" fill="none" stroke="#3a3d39" strokeWidth="5" />
      <g fill="none" stroke="#3a3d39" strokeWidth="4"><path d="M214 714 L178 760 L240 790" /><path d="M386 714 L422 760 L360 790" /></g>
      {/* neck */}
      <path d="M258 600 L254 714 Q300 744 346 714 L342 600 Z" fill={SKIN} />
      <path d="M258 600 L254 714 Q300 744 346 714 L342 600 Z" fill={`url(#${id}-hatch)`} opacity="0.8" />
      <g data-part="head">
        {/* ears */}
        <ellipse cx="186" cy="452" rx="17" ry="34" fill={SKIN} stroke={INK} strokeWidth="2.5" />
        <ellipse cx="414" cy="452" rx="17" ry="34" fill={SKIN} stroke={INK} strokeWidth="2.5" />
        <path d={face} fill={SKIN} />
        <g mask={`url(#${id}-mL)`}><path d={face} fill={`url(#${id}-hatch)`} /></g>
        {/* stubble */}
        <clipPath id={`${id}-jaw`}><path d="M196 500 C210 580 250 630 300 636 C350 630 390 580 404 500 C380 540 340 530 300 528 C260 530 220 540 196 500 Z" /></clipPath>
        <rect x="180" y="490" width="240" height="160" fill={`url(#${id}-stipple)`} clipPath={`url(#${id}-jaw)`} opacity="0.75" />
        <path d={face} fill="none" stroke={INK} strokeWidth="2.6" />
        <path data-part="brow-l" d="M210 386 Q246 372 284 382" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path data-part="brow-r" d="M316 382 Q354 372 390 386" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <Eye x={250} y={432} lashes={false} id={id} />
        <Eye x={350} y={432} lashes={false} id={id} />
        {/* glasses */}
        <g fill="none" stroke={INK} strokeWidth="5">
          <rect x="200" y="400" width="96" height="66" rx="16" /><rect x="304" y="400" width="96" height="66" rx="16" />
          <path d="M292 424 Q300 414 308 424" /><path d="M200 420 L170 432" /><path d="M400 420 L430 432" />
        </g>
        <clipPath id={`${id}-lens`}><rect x="200" y="400" width="96" height="66" rx="16" /><rect x="304" y="400" width="96" height="66" rx="16" /></clipPath>
        <g clipPath={`url(#${id}-lens)`}><path data-part="glint" d="M190 480 L230 390 L246 390 L206 480 Z" fill="#fff" opacity="0.55" /></g>
        {/* nose */}
        <path d="M302 474 C300 488 292 500 294 509 C300 516 311 514 317 507" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M262 540 Q300 530 338 540" fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="3" />
        <Mouth id="" />
        {/* hair */}
        <g data-part="sway">
          {curls.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#181a19" />)}
          <g fill="none" stroke="#5a5d58" strokeWidth="1.5" opacity="0.85">
            {curls.map(([x, y, r], i) => <path key={i} d={`M${x - r * 0.5} ${y + r * 0.1} a${r * 0.45} ${r * 0.45} 0 1 1 ${r * 0.6} ${r * 0.35}`} />)}
          </g>
        </g>
      </g>
      {/* rim light (right) */}
      <path d="M356 186 C420 206 452 268 446 340" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" filter={`url(#${id}-glow)`} />
      <path d="M416 420 C416 516 388 588 348 624" fill="none" stroke={accent} strokeWidth="3" opacity="0.8" filter={`url(#${id}-glow)`} />
      <path d="M424 718 C504 738 566 796 576 900" fill="none" stroke={accent} strokeWidth="4" filter={`url(#${id}-glow)`} />
    </>
  )
}

/** An ink hand that rises and waves on GREETING. */
function Hand({ sleeve }: { sleeve: string }) {
  return (
    <g data-part="hand" transform="translate(470 1100)">
      <g data-part="wave">
        <path d="M-50 10 L-46 150 L46 150 L50 10 Z" fill={sleeve} stroke={INK} strokeWidth="3" />
        <path d="M-40 4 C-46 -40 -44 -78 -36 -96 L36 -96 C44 -78 46 -40 40 4 Z" fill={SKIN} stroke={INK} strokeWidth="3" />
        {[[-34, 60], [-15, 72], [4, 68], [22, 54]].map(([x, h]) => (
          <rect key={x} x={x} y={-96 - h} width="17" height={h + 12} rx="8.5" fill={SKIN} stroke={INK} strokeWidth="3" />
        ))}
        <rect x="-70" y="-62" width="17" height="56" rx="8.5" fill={SKIN} stroke={INK} strokeWidth="3" transform="rotate(-38 -62 -10)" />
        <path d="M-30 -30 Q0 -20 30 -30" fill="none" stroke={INK} strokeOpacity=".35" strokeWidth="2" />
      </g>
    </g>
  )
}

export const InkCharacter = forwardRef<InkHandle, Props>(function InkCharacter({ config, state, expression = 'neutral', height = '80vh', className, track = true, label }, ref) {
  const svg = useRef<SVGSVGElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const exprRef = useRef(expression)
  exprRef.current = expression
  const raw = useId().replace(/:/g, '')
  const id = `ink${raw}`
  useImperativeHandle(ref, () => ({ svg: svg.current }), [])

  useEffect(() => {
    const root = svg.current!
    const q = (s: string) => Array.from(root.querySelectorAll<SVGGraphicsElement>(`[data-part="${s}"]`))
    const heads = q('head'), jhumkas = q('jhumka'), pupils = q('pupil'), lids = q('lid'), sway = q('sway'), glint = q('glint')[0]
    const browL = q('brow-l')[0], browR = q('brow-r')[0]
    const inner = q('mouth-in')[0], lipLow = q('lip-low')[0], lipUp = q('lip-up')[0], dimples = q('dimples')[0]
    const hand = q('hand')[0], wave = q('wave')[0]
    const body = root.querySelector<SVGGElement>('[data-part="breath"]')!

    let tx = 0, ty = 0, lx = 0, ly = 0
    const onMove = (e: PointerEvent) => {
      if (!track) return
      const r = root.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45)))
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.45)) / (window.innerHeight * 0.5)))
    }
    window.addEventListener('pointermove', onMove)

    let nextBlink = performance.now() + 1500, blinkStart = -1
    let raf = 0, visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(root)
    const t0 = performance.now()
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    // eased values
    let smile = 0, lidBase = 0, browIn = 0, open = 0, handY = 1, glance = 0, nextGlance = performance.now() + 3000

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden) return
      const t = (now - t0) / 1000
      const s = stateRef.current
      const ex = exprRef.current
      // idle life: glance around every few seconds when nobody is moving the pointer
      if (now > nextGlance) { glance = (Math.random() - 0.5) * 1.4; nextGlance = now + 2500 + Math.random() * 4000 }
      let gx = tx + (s === 'IDLE' ? glance * 0.5 : 0), gy = ty
      if (s === 'THINKING') { gx = -0.7; gy = -0.9 }
      if (s === 'LISTENING') { gx = tx * 0.4; gy = 0.1 }
      if (ex === 'calm') { gx = 0; gy = 0.3 }
      lx += (gx - lx) * 0.08
      ly += (gy - ly) * 0.08
      const speaking = s === 'SPEAKING' || s === 'GREETING'
      const breath = still ? 0 : Math.sin(t * (ex === 'calm' ? 0.7 : 1.25)) * (ex === 'calm' ? 5 : 3)
      body.setAttribute('transform', `translate(0 ${breath.toFixed(2)})`)
      const nod = s === 'LISTENING' ? Math.sin(t * 2.2) * 2.5 : 0
      const talkBob = speaking && !still ? Math.sin(t * 6) * 1.6 * open : 0
      const tilt = lx * 4 + (s === 'LISTENING' ? 5 : 0) + (s === 'REACTING' ? Math.sin(t * 9) * 2 : 0) + (ex === 'happy' ? Math.sin(t * 1.6) * 1.5 : 0) + talkBob
      heads.forEach((h) => h.setAttribute('transform', `rotate(${tilt.toFixed(2)} 300 660) translate(${(lx * 6).toFixed(1)} ${(ly * 3 + nod).toFixed(1)})`))
      jhumkas.forEach((j, i) => { const b = j.getBBox(); j.setAttribute('transform', `rotate(${(Math.sin(t * 2.4 + i) * 6 - lx * 8 + talkBob * 3).toFixed(2)} ${b.x + b.width / 2} ${b.y + 4})`) })
      pupils.forEach((p) => p.setAttribute('transform', `translate(${(lx * 9).toFixed(2)} ${(ly * 6).toFixed(2)})`))
      sway.forEach((g) => g.setAttribute('transform', `rotate(${(Math.sin(t * 0.9) * 0.8 - lx * 1.2).toFixed(2)} 300 260)`))
      // expression targets
      const smileT = ex === 'happy' ? 1 : ex === 'calm' ? 0.35 : ex === 'concerned' ? -0.35 : ex === 'surprised' ? 0 : 0.25
      const lidT = ex === 'calm' ? 0.9 : ex === 'happy' ? 0.22 : ex === 'concerned' ? 0.12 : ex === 'surprised' ? -0.1 : 0
      const browT = ex === 'concerned' ? 1 : 0
      smile += (smileT - smile) * 0.08
      lidBase += (lidT - lidBase) * 0.08
      browIn += (browT - browIn) * 0.08
      // blink
      let lid = Math.max(0, lidBase)
      if (!still && now > nextBlink && blinkStart < 0) blinkStart = now
      if (blinkStart > 0) {
        const k = (now - blinkStart) / 150
        lid = Math.max(lid, k < 1 ? k : k < 2 ? 2 - k : 0)
        if (k >= 2) { blinkStart = -1; nextBlink = now + 2200 + Math.random() * 3200 }
      }
      if (s === 'ERROR') lid = 0.45
      lids.forEach((l) => (l.style.transform = `scaleY(${lid.toFixed(3)})`))
      // brows
      const b = (s === 'REACTING' || ex === 'surprised' ? -10 : s === 'THINKING' ? -6 : s === 'LISTENING' ? -3 : 0) + (speaking ? -Math.max(0, Math.sin(t * 2.3)) * 3 : 0)
      browL.setAttribute('transform', `translate(0 ${b.toFixed(1)}) rotate(${(-9 * browIn).toFixed(2)} 282 388)`)
      browR.setAttribute('transform', `translate(0 ${(s === 'THINKING' ? 2 : b).toFixed(1)}) rotate(${(9 * browIn).toFixed(2)} 318 388)`)
      // mouth: word boundaries from the speech engine push it open, it eases shut
      let target = 0
      if (speaking) {
        const since = now - mouth.boundaryAt
        target = still ? 0.3 : since < 900 ? Math.max(0, 1 - since / 260) * 0.75 + Math.abs(Math.sin(t * 13)) * 0.35 : Math.abs(Math.sin(t * 11.5)) * 0.5
      }
      if (s === 'REACTING' || ex === 'surprised') target = Math.max(target, 0.45)
      open += (target - open) * 0.35
      const cy = 561 - smile * 7
      inner.setAttribute('ry', (0.1 + open * 11).toFixed(2))
      inner.setAttribute('rx', (21 + smile * 4).toFixed(2))
      inner.setAttribute('cy', (562 + open * 4).toFixed(2))
      lipLow.setAttribute('d', `M${268 - smile * 4} ${cy.toFixed(1)} Q300 ${(574 + open * 16 + smile * 8).toFixed(1)} ${332 + smile * 4} ${cy.toFixed(1)}`)
      lipUp.setAttribute('d', `M${266 - smile * 4} ${cy.toFixed(1)} Q284 ${(552 - smile * 2).toFixed(1)} 300 556 Q316 ${(552 - smile * 2).toFixed(1)} ${334 + smile * 4} ${cy.toFixed(1)}`)
      dimples.setAttribute('opacity', Math.max(0, smile - 0.4).toFixed(2))
      // the wave
      const handT = s === 'GREETING' ? 0 : 1
      handY += (handT - handY) * 0.07
      hand.setAttribute('transform', `translate(470 ${(700 + handY * 420).toFixed(1)})`)
      wave.setAttribute('transform', `rotate(${(handY < 0.5 ? Math.sin(t * 9) * 16 : 0).toFixed(2)} 0 100)`)
      if (glint) glint.setAttribute('transform', `translate(${(((t * 60) % 520) - 60).toFixed(1)} 0)`)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('pointermove', onMove) }
  }, [track, config.id])

  const C = config.id === 'reenu' ? Reenu : Roman
  return (
    <svg ref={svg} className={className} viewBox="0 0 600 900" style={{ height, width: 'auto', aspectRatio: '600 / 900', display: 'block', overflow: 'hidden' }} role="img" aria-label={label ?? `${config.name}, your MindMirror companion (illustration)`}>
      <Defs id={id} accent={config.accent} />
      <g data-part="breath"><C id={id} accent={config.accent} /></g>
      <Hand sleeve={config.id === 'reenu' ? '#c9465a' : '#232523'} />
    </svg>
  )
})

/** Serialise an inline SVG into an Image (used by the ASCII assembly effect). */
export function svgToImage(svgEl: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
}
