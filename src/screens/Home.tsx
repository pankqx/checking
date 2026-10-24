import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Buddy, Caption } from '../components/Buddy'
import { ModeToggle, RiseText, useCoverflow, usePageMotion } from '../components/fx'
import { Orb } from '../components/Orb'
import { Doodle, Section, Stamp } from '../components/ui'
import { pick, characters } from '../character/characters'
import { LADDER, pressureMap, SIGNAL_META, type Insight, type Level, type Signal } from '../lib/analysis'
import { sayOnce, useBuddy } from '../lib/buddy'
import { go, type Route } from '../lib/nav'
import { usePendant } from '../lib/pendantStore'
import { useData } from '../lib/useData'

const greet = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const LEVEL_STYLE: Record<Level, { label: string; color: string; fill: number }> = {
  steady: { label: 'steady', color: 'var(--pista)', fill: 0.25 },
  shifting: { label: 'shifting', color: 'var(--haldi)', fill: 0.6 },
  strained: { label: 'strained', color: 'var(--sindoor)', fill: 1 },
  unknown: { label: 'learning', color: 'var(--line)', fill: 0.1 },
}

const SPOKEN: Record<string, string> = {
  sleep: 'your sleep has been drifting below your normal. Want to try a 4-7-8 breath tonight?',
  pressure: 'tomorrow looks heavier than your plan. Shall we move one thing together?',
  connection: 'you’ve had fewer good conversations lately. Maybe message one friend today?',
  energy: 'your body has been working a bit harder than usual. Go gently today.',
  drive: 'a few habits slipped this week. Pick just one to keep today. That’s enough.',
  rhythm: 'your days are drifting later into the night. A short morning walk could reset you.',
  'mood-up': 'you’ve been brighter than usual! Whatever you’re doing, it’s working.',
}

export function homeLine(name: string | undefined, top: Insight | undefined, checkedIn: boolean, opener: string) {
  const hi = `${greet()}${name ? `, ${name}` : ''}!`
  const body = top && SPOKEN[top.id] ? `${opener} ${SPOKEN[top.id]}` : 'Nothing unusual compared with your normal. I’m proud of you.'
  return `${hi} ${body}${checkedIn ? '' : ' Tap the mirror when you’re ready for a 30-second check-in.'}`
}

export default function Home() {
  const d = useData()
  const b = useBuddy()
  const pendant = usePendant()
  const pm = usePageMotion()
  const grand = b.ui === 'grandeur'
  const rail = useRef<HTMLDivElement>(null)
  useCoverflow(rail, grand ? 1 : 0.35)
  const name = d.profile?.name
  const top = d.insights[0]
  const pm7 = pressureMap(d.tasks, 7)
  const maxDue = Math.max(4, ...pm7.map((p) => Math.max(p.due, p.planned)))
  const latestThought = d.thoughts[0]
  const restingHr = [...d.health].reverse().find((h) => h.kind === 'restingHr' || h.kind === 'hr')
  const cfg = characters[b.character]
  const [opener] = useState(() => pick(cfg.openers))
  const line = homeLine(name, top, !!d.todayCheckin, opener)
  const ready = d.profile !== undefined && d.checkins !== undefined

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => sayOnce('home', line, { greet: true, expression: d.weather.rung >= 1 ? 'concerned' : 'happy' }), 500)
    return () => clearTimeout(t)
  }, [ready, top?.id, d.todayCheckin?.id])

  return (
    <motion.main {...pm} className="mx-auto max-w-5xl pb-36">
      <header className="flex items-center justify-between gap-3 px-5 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <button onClick={() => go('you')} className="grid size-9 place-items-center rounded-full bg-ink text-sm font-bold text-paper" aria-label="You">
            {(name?.[0] ?? '☺').toUpperCase()}
          </button>
        </div>
      </header>

      {/* Hero: greeting + the companion */}
      <section className={`relative px-5 pt-4 md:grid md:grid-cols-[1.1fr_1fr] md:items-center md:gap-8 ${grand ? 'md:pt-10' : ''}`}>
        <div className="relative z-10">
          <h1 className={`display leading-[1.02] ${grand ? 'text-[3.1rem] md:text-7xl' : 'text-[2.6rem] md:text-6xl'}`}>
            {grand ? <RiseText text={`${greet()},`} /> : `${greet()},`}
            <br />
            <span className="display-i text-sindoor">{name ?? 'friend'}</span>
          </h1>
          <button onClick={() => go('insights')} className="mt-4 flex items-center gap-2 text-left">
            <Stamp color={d.weather.rung >= 2 ? 'var(--sindoor)' : d.weather.rung === 1 ? 'var(--haldi)' : 'var(--pista)'}>Mind weather</Stamp>
            <span className="display-i text-xl">{d.weather.name}</span>
          </button>
          <p className="mt-1 max-w-sm text-ink-soft">{d.weather.line}</p>
          <div className="mt-5 hidden md:block"><Caption fallback={line} replay={line} /></div>
        </div>

        <div className="relative mx-auto mt-2 flex w-full max-w-md flex-col items-center md:mt-0">
          <div className="relative">
            {grand && <SignalOrbit signals={d.signals} />}
            {!grand && <div className="absolute inset-x-6 bottom-6 top-16 -z-10 rounded-[48%_52%_40%_60%] bg-paper-2" />}
            <button onClick={() => go('companion')} aria-label={`Talk to ${cfg.name}`} className="relative block">
              <Buddy height={grand ? 430 : 340} />
            </button>
            <motion.button
              onClick={() => go('checkin')}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 14 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-ink py-1.5 pl-1.5 pr-4 text-sm font-semibold text-paper shadow-xl"
              style={grand ? { background: 'linear-gradient(120deg, var(--pista), var(--neel) 55%, var(--haldi))', color: '#07060d' } : undefined}
            >
              <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-paper/20"><Orb mood={d.todayCheckin?.mood ?? d.lastMood} size={44} face={false} /></span>
              {d.todayCheckin ? 'Checked in · add another' : 'How’s your mind? · 30s'}
            </motion.button>
          </div>
          <div className="-mt-1 w-full md:hidden"><Caption fallback={line} replay={line} tail="none" /></div>
        </div>
      </section>

      {/* Widget rail */}
      <div className="mt-8 flex items-end justify-between px-5">
        <h2 className="display-i text-2xl">Your rooms</h2>
        <span className="text-xs text-ink-faint">swipe →</span>
      </div>
      <div ref={rail} className="snap-row mt-3 px-5" style={{ perspective: 900 }}>
        <Widget route="insights" tint="var(--neel)" kicker="Insights" art="spark" wide glow>
          <p className="display text-2xl leading-tight">{top?.title}</p>
          <p className="mt-2 line-clamp-3 text-sm opacity-80">{top?.body}</p>
          {top?.metric && <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{top.metric.label} · {top.metric.value}</p>}
        </Widget>
        <Widget route="thoughts" tint="var(--haldi)" dark kicker="Thoughts" art="cloud">
          {latestThought ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{latestThought.kind}</p>
              <p className="display-i mt-1 line-clamp-4 text-xl leading-snug">&ldquo;{latestThought.text}&rdquo;</p>
            </>
          ) : (
            <p className="display text-2xl leading-tight">Empty your head onto paper.</p>
          )}
        </Widget>
        <Widget route="meditation" tint="#1c2347" kicker="Meditation room" art="lotus">
          <p className="display text-2xl leading-tight">Breathe with the tanpura.</p>
          <p className="mt-2 text-sm opacity-75">{cfg.name} guides you · Box · 4-7-8 · Calm</p>
        </Widget>
        <Widget route="release" tint="var(--sindoor)" kicker="Pressure release" art="grid">
          <p className="display text-2xl leading-tight">Pop. Shred. Shout. Scribble.</p>
          <p className="mt-2 text-sm opacity-85">Let the pressure out, privately.</p>
        </Widget>
        <Widget route="body" tint="var(--pista)" dark kicker="Body" art="heart">
          {restingHr ? (
            <>
              <p className="display text-5xl">{Math.round(restingHr.value)}<span className="text-lg"> bpm</span></p>
              <p className="mt-1 text-sm opacity-75">{restingHr.kind === 'hr' ? 'last heart rate' : 'resting heart rate'}</p>
            </>
          ) : (
            <p className="display text-2xl leading-tight">Connect a watch, if you like.</p>
          )}
        </Widget>
        <Widget route="pendant" tint="#1e1b16" kicker="Pendant" art="pendant">
          <p className="display text-2xl leading-tight">{pendant.status === 'connected' ? pendant.name : 'Talk, hands-free.'}</p>
          <p className="mt-2 text-sm opacity-75">{pendant.status === 'connected' ? `Connected · ${pendant.battery ?? '–'}%` : 'Pair the MindMirror pendant'}</p>
        </Widget>
      </div>

      <div className="px-5 md:grid md:grid-cols-2 md:gap-6">
        <Section title="Six early signals" action={<button className="text-sm text-ink-soft underline underline-offset-4" onClick={() => go('insights')}>proof</button>}>
          <div className="grid grid-cols-3 gap-2">
            {d.signals.map((s, i) => (
              <motion.button key={s.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} onClick={() => go('insights')} className="card flex flex-col items-start gap-2 rounded-3xl p-3 text-left">
                <span className="relative block size-7 rounded-full border-2" style={{ borderColor: SIGNAL_META[s.id].color }}>
                  <motion.span className="absolute inset-0.5 rounded-full" style={{ background: LEVEL_STYLE[s.level].color }} animate={s.level === 'strained' ? { opacity: [0.5, 1, 0.5], scale: [0.9, 1.05, 0.9] } : { opacity: 0.25 + LEVEL_STYLE[s.level].fill * 0.75 }} transition={{ duration: 2.4, repeat: s.level === 'strained' ? Infinity : 0 }} />
                </span>
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[11px] uppercase tracking-wider text-ink-faint">{LEVEL_STYLE[s.level].label}</span>
              </motion.button>
            ))}
          </div>
        </Section>

        <Section title="PressureMap" action={<button className="text-sm text-ink-soft underline underline-offset-4" onClick={() => go('planner')}>plan</button>}>
          <div className="card p-4">
            <div className="flex h-32 items-end gap-2">
              {pm7.map((p, i) => (
                <div key={p.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-24 w-full items-end justify-center">
                    <div className="absolute bottom-0 w-full rounded-t-lg border-2 border-dashed border-ink-faint/50" style={{ height: `${(p.planned / maxDue) * 100}%` }} />
                    <motion.div initial={{ height: 0 }} whileInView={{ height: `${(p.due / maxDue) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 120, damping: 14 }} className="w-3/5 rounded-t-lg" style={{ background: p.gap >= 2 ? 'var(--sindoor)' : 'var(--neel)', boxShadow: grand ? `0 0 18px ${p.gap >= 2 ? 'var(--sindoor)' : 'var(--neel)'}` : undefined }} />
                  </div>
                  <span className="text-[11px] text-ink-faint">{i === 0 ? 'today' : new Date(p.day + 'T12:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-faint">Solid = hours of work due · dashed = hours you planned</p>
          </div>
        </Section>
      </div>

      {d.weather.rung >= 1 && (
        <div className="px-5">
          <Section title="A next step">
            <div className="card flex items-start gap-4 p-5" style={{ borderColor: 'var(--haldi)' }}>
              <span className="display text-4xl text-haldi">{d.weather.rung + 1}</span>
              <div>
                <p className="font-semibold">{LADDER[d.weather.rung].title}</p>
                <p className="mt-1 text-sm text-ink-soft">{LADDER[d.weather.rung].body}</p>
              </div>
            </div>
          </Section>
        </div>
      )}

      <p className="mt-10 flex items-center justify-center gap-2 px-5 text-center text-xs text-ink-faint">
        <span className="inline-block size-2 rounded-full bg-pista" /> Private by design · 0 personal records sent online
      </p>
    </motion.main>
  )
}

/** Grandeur: the six signals orbit the companion as glowing nodes. */
function SignalOrbit({ signals }: { signals: Signal[] }) {
  const R = 46
  return (
    <svg viewBox="-60 -60 120 120" className="pointer-events-none absolute left-1/2 top-[44%] -z-10 w-[118%] -translate-x-1/2 -translate-y-1/2" aria-hidden>
      <defs>
        <radialGradient id="halo"><stop offset="0" stopColor="#a78bfa" stopOpacity=".45" /><stop offset=".6" stopColor="#5eead4" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <circle r="58" fill="url(#halo)" />
      <g className="spin-slow"><circle r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".3" strokeDasharray="1 2.2" /></g>
      <g className="spin-rev"><ellipse rx={R + 8} ry={R - 14} fill="none" stroke="rgba(167,139,250,.35)" strokeWidth=".25" transform="rotate(-18)" /></g>
      <motion.circle r={R - 9} fill="none" stroke="url(#halo)" strokeWidth="0.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: 'easeInOut' }} />
      {signals.map((s, i) => {
        const a = (i / signals.length) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(a) * R, y = Math.sin(a) * R
        const c = LEVEL_STYLE[s.level].color === 'var(--line)' ? '#8f89ad' : LEVEL_STYLE[s.level].color
        return (
          <g key={s.id} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
            <motion.circle r="2.2" fill={c} style={{ filter: `drop-shadow(0 0 2px ${c})` }} animate={{ scale: [1, s.level === 'strained' ? 1.6 : 1.25, 1] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.4 }} />
            <text y={y < 0 ? -4 : 6.5} textAnchor="middle" fontSize="3.4" fill="#c9c3e6" fontFamily="Manrope" fontWeight="600" letterSpacing=".2">{s.label.toUpperCase()}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Widget({ route, tint, kicker, art, children, wide, dark, glow }: { route: Route; tint: string; kicker: string; art: Parameters<typeof Doodle>[0]['kind']; children: ReactNode; wide?: boolean; dark?: boolean; glow?: boolean }) {
  const { ui } = useBuddy()
  const grand = ui === 'grandeur'
  const style = grand
    ? { background: `radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, ${tint} 55%, transparent), transparent 65%), rgba(255,255,255,.05)`, color: '#f3f0ff', border: '1px solid rgba(255,255,255,.12)', backdropFilter: 'blur(14px)' }
    : { background: tint, color: dark ? '#1e1b16' : '#f6f1e7' }
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => go(route)}
      className={`widget relative flex h-64 flex-col overflow-hidden rounded-[30px] p-5 text-left shadow-[var(--shadow)] transition-[opacity] ${wide ? 'w-[84%] sm:w-80' : 'w-[70%] sm:w-64'} ${glow ? 'glow-border' : ''}`}
      style={style}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">{kicker}</span>
      <Doodle kind={art} className={`pointer-events-none absolute -right-3 -top-2 size-28 ${grand ? 'opacity-40' : 'opacity-25'}`} />
      <div className="widget-body mt-auto">{children}</div>
    </motion.button>
  )
}
