import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Orb } from '../components/Orb'
import { Doodle, Section, Stamp } from '../components/ui'
import { LADDER, pressureMap, SIGNAL_META, type Level } from '../lib/analysis'
import { go, type Route } from '../lib/nav'
import { useData } from '../lib/useData'
import { usePendant } from '../lib/pendantStore'

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

export default function Home() {
  const d = useData()
  const pendant = usePendant()
  const name = d.profile?.name
  const top = d.insights[0]
  const pm = pressureMap(d.tasks, 7)
  const maxDue = Math.max(4, ...pm.map((p) => Math.max(p.due, p.planned)))
  const latestThought = d.thoughts[0]
  const restingHr = [...d.health].reverse().find((h) => h.kind === 'restingHr' || h.kind === 'hr')

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-5xl pb-36">
      <header className="flex items-center justify-between px-5 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
        <button onClick={() => go('you')} className="grid size-10 place-items-center rounded-full bg-ink text-sm font-bold text-paper" aria-label="You">
          {(name?.[0] ?? '☺').toUpperCase()}
        </button>
      </header>

      {/* The mirror */}
      <section className="relative px-5 pt-2 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-10">
        <div>
          <h1 className="display text-[2.7rem] leading-[1.02] md:text-6xl">
            {greet()}
            {name ? <>,<br /><span className="display-i text-sindoor">{name}</span></> : '.'}
          </h1>
          <button onClick={() => go('insights')} className="mt-4 flex items-center gap-2 text-left">
            <Stamp color={d.weather.rung >= 2 ? 'var(--sindoor)' : d.weather.rung === 1 ? 'var(--haldi)' : 'var(--pista)'}>Mind weather</Stamp>
            <span className="display-i text-xl">{d.weather.name}</span>
          </button>
          <p className="mt-1 max-w-sm text-ink-soft">{d.weather.line}</p>
        </div>
        <button onClick={() => go('checkin')} className="relative mx-auto mt-2 block md:mt-0" aria-label="Check in">
          <Orb mood={d.todayCheckin?.mood ?? d.lastMood} size={230} />
          {!d.todayCheckin && (
            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 }} className="absolute -right-1 bottom-6 rotate-[-6deg] rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-lg">
              How&rsquo;s your mind? · 30s
            </motion.span>
          )}
        </button>
      </section>

      {/* Widget rail */}
      <div className="mt-6 flex items-end justify-between px-5">
        <h2 className="display-i text-2xl">Your rooms</h2>
        <span className="text-xs text-ink-faint">swipe →</span>
      </div>
      <div className="snap-row mt-3 px-5 md:flex-wrap md:overflow-visible">
        <Widget route="insights" bg="var(--neel)" fg="#f3eee4" kicker="Insights" art="spark" wide>
          <p className="display text-2xl leading-tight">{top?.title}</p>
          <p className="mt-2 line-clamp-3 text-sm opacity-80">{top?.body}</p>
          {top?.metric && <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{top.metric.label} · {top.metric.value}</p>}
        </Widget>
        <Widget route="thoughts" bg="var(--haldi)" fg="#1e1b16" kicker="Thoughts" art="cloud">
          {latestThought ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{latestThought.kind}</p>
              <p className="display-i mt-1 line-clamp-4 text-xl leading-snug">&ldquo;{latestThought.text}&rdquo;</p>
            </>
          ) : (
            <p className="display text-2xl leading-tight">Empty your head onto paper.</p>
          )}
        </Widget>
        <Widget route="meditation" bg="#1c2347" fg="#f3eee4" kicker="Meditation room" art="lotus">
          <p className="display text-2xl leading-tight">Breathe with the tanpura.</p>
          <p className="mt-2 text-sm opacity-75">Box · 4-7-8 · Calm 4-6 · 1 to 10 min</p>
        </Widget>
        <Widget route="release" bg="var(--sindoor)" fg="#fff" kicker="Pressure release" art="grid">
          <p className="display text-2xl leading-tight">Pop. Shred. Shout. Scribble.</p>
          <p className="mt-2 text-sm opacity-85">Let the pressure out, privately.</p>
        </Widget>
        <Widget route="body" bg="var(--pista)" fg="#1e1b16" kicker="Body" art="heart">
          {restingHr ? (
            <>
              <p className="display text-5xl">{Math.round(restingHr.value)}<span className="text-lg"> bpm</span></p>
              <p className="mt-1 text-sm opacity-75">{restingHr.kind === 'hr' ? 'last heart rate' : 'resting heart rate'}</p>
            </>
          ) : (
            <p className="display text-2xl leading-tight">Connect a watch, if you like.</p>
          )}
        </Widget>
        <Widget route="pendant" bg="var(--ink)" fg="var(--paper)" kicker="Pendant" art="pendant">
          <p className="display text-2xl leading-tight">{pendant.status === 'connected' ? pendant.name : 'Talk, hands-free.'}</p>
          <p className="mt-2 text-sm opacity-75">{pendant.status === 'connected' ? `Connected · ${pendant.battery ?? '–'}%` : 'Pair the MindMirror pendant'}</p>
        </Widget>
      </div>

      <div className="px-5 md:grid md:grid-cols-2 md:gap-6">
        {/* Six signals */}
        <Section title="Six early signals" action={<button className="text-sm text-ink-soft underline underline-offset-4" onClick={() => go('insights')}>proof</button>}>
          <div className="grid grid-cols-3 gap-2">
            {d.signals.map((s) => (
              <button key={s.id} onClick={() => go('insights')} className="card flex flex-col items-start gap-2 rounded-3xl p-3 text-left">
                <span className="relative block size-7 rounded-full border-2" style={{ borderColor: SIGNAL_META[s.id].color }}>
                  <span className="absolute inset-0.5 rounded-full" style={{ background: LEVEL_STYLE[s.level].color, opacity: 0.25 + LEVEL_STYLE[s.level].fill * 0.75 }} />
                </span>
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[11px] uppercase tracking-wider text-ink-faint">{LEVEL_STYLE[s.level].label}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* PressureMap */}
        <Section title="PressureMap" action={<button className="text-sm text-ink-soft underline underline-offset-4" onClick={() => go('planner')}>plan</button>}>
          <div className="card p-4">
            <div className="flex h-32 items-end gap-2">
              {pm.map((p, i) => (
                <div key={p.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-24 w-full items-end justify-center">
                    <div className="absolute bottom-0 w-full rounded-t-lg border-2 border-dashed border-ink-faint/50" style={{ height: `${(p.planned / maxDue) * 100}%` }} />
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(p.due / maxDue) * 100}%` }} transition={{ delay: i * 0.05 }} className="w-3/5 rounded-t-lg" style={{ background: p.gap >= 2 ? 'var(--sindoor)' : 'var(--neel)' }} />
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

function Widget({ route, bg, fg, kicker, art, children, wide }: { route: Route; bg: string; fg: string; kicker: string; art: Parameters<typeof Doodle>[0]['kind']; children: ReactNode; wide?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -4, rotate: -0.6 }}
      onClick={() => go(route)}
      className={`relative flex h-64 flex-col overflow-hidden rounded-[30px] p-5 text-left shadow-[var(--shadow)] ${wide ? 'w-[84%] sm:w-80' : 'w-[70%] sm:w-64'}`}
      style={{ background: bg, color: fg }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">{kicker}</span>
      <Doodle kind={art} className="pointer-events-none absolute -right-3 -top-2 size-28 opacity-25" />
      <div className="mt-auto">{children}</div>
    </motion.button>
  )
}
