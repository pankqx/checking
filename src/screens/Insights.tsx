import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SignalLotus, SkyScene, SupportPath } from '../components/art'
import { Orb } from '../components/Orb'
import { Screen, Section, Stamp } from '../components/ui'
import { healthDaily, LADDER, mean, moodSeries, round1, SIGNAL_META } from '../lib/analysis'
import { db, dayKey } from '../lib/db'
import { go, type Route } from '../lib/nav'
import { useData } from '../lib/useData'
import { useBuddy } from '../lib/buddy'
import { isDark } from '../games/ascii'
import { LEVEL_STYLE } from '../lib/levels'

const short = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const axis = { stroke: 'var(--ink-faint)', fontSize: 11, tickLine: false, axisLine: false }
const tip = { contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 12, color: 'var(--ink)' } }

export default function Insights() {
  const d = useData()
  const [open, setOpen] = useState<string | null>(null)
  const { ui } = useBuddy()
  const night = ui === 'grandeur' || isDark()
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? []
  const series = moodSeries(d.checkins).slice(-21).map((s) => ({ ...s, label: short(s.day) }))
  const normal = d.profile?.usualSleep ?? mean(series.slice(0, -3).filter((s) => s.sleep != null).map((s) => s.sleep!))
  const rhr = healthDaily(d.health, 'restingHr').slice(-21).map((p) => ({ ...p, label: short(p.day) }))

  // Weekly reflection, computed
  const weekAgo = dayKey(Date.now() - 6 * 86400000)
  const week = series.filter((s) => s.day >= weekAgo)
  const best = [...week].sort((a, b) => b.mood - a.mood)[0]
  const tagCount = new Map<string, number>()
  d.checkins.filter((c) => c.day >= weekAgo).forEach((c) => c.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)))
  const topTag = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const grat = d.thoughts.filter((t) => t.kind === 'gratitude' && dayKey(t.at) >= weekAgo).length
  const roomMin = Math.round(sessions.filter((s) => dayKey(s.at) >= weekAgo).reduce((a, s) => a + s.minutes, 0))

  return (
    <Screen title={<>What&rsquo;s <span className="display-i text-accent">changed</span>?</>} kicker="insights · you vs your normal">
      <div className="card overflow-hidden p-0">
        <SkyScene variant="banner" weather={d.weather} tod={night ? 'night' : undefined} className="block aspect-[2/1] w-full" />
        <div className="flex items-center gap-4 p-5 pt-4">
          <Orb mood={d.lastMood} size={72} face={false} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">Mind weather</p>
            <p className="display text-3xl">{d.weather.name}</p>
            <p className="mt-1 text-sm text-ink-soft">{d.weather.line}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 px-1 text-xs text-ink-faint">Not a diagnosis. Each signal compares your last few days with your own previous weeks.</p>

      <Section title="Insights for you">
        <div className="snap-row -mx-4">
          {d.insights.map((i) => (
            <div key={i.id} className="card flex w-[82%] flex-col p-5 sm:w-80" style={{ borderColor: i.tone === 'care' ? 'var(--care)' : i.tone === 'nudge' ? 'var(--haldi)' : 'var(--pista)' }}>
              {i.metric && <p className="display text-4xl" style={{ color: i.tone === 'care' ? 'var(--care-ink)' : i.tone === 'nudge' ? 'var(--shift-ink)' : 'var(--steady-ink)' }}>{i.metric.value}</p>}
              <p className="mt-1 text-lg font-semibold leading-snug">{i.title}</p>
              <p className="mt-2 text-sm text-ink-soft">{i.body}</p>
              <p className="mt-3 border-t border-dashed border-line pt-2 text-xs text-ink-faint">🔍 {i.proof}</p>
              {i.action && <button className="btn btn-ghost mt-4 self-start py-2 text-sm" onClick={() => go(i.action!.route as Route)}>{i.action.label} →</button>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Six early signals">
        <div className="card mb-3 px-2 pt-4 pb-2">
          <SignalLotus signals={d.signals} onPick={(id) => setOpen(id)} className="mx-auto block w-full max-w-sm" />
          <p className="px-3 pb-1 text-center text-xs text-ink-faint">Tap a petal&rsquo;s name to see the proof below.</p>
        </div>
        <div className="space-y-2">
          {d.signals.map((s) => (
            <button key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className="card block w-full rounded-3xl p-4 text-left">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ background: LEVEL_STYLE[s.level].color }} />
                <span className="font-semibold">{s.label}</span>
                <span className="text-xs text-ink-faint">watches for {SIGNAL_META[s.id].sign}</span>
                <span className="ml-auto shrink-0"><Stamp color={LEVEL_STYLE[s.level].color === 'var(--line)' ? 'var(--ink-faint)' : LEVEL_STYLE[s.level].color}>{LEVEL_STYLE[s.level].label}</Stamp></span>
              </div>
              <p className="mt-2 text-ink-soft">{s.headline}{s.delta ? <span className="ml-2 font-semibold text-ink">{s.delta}</span> : null}</p>
              {open === s.id && <p className="mt-2 text-xs text-ink-faint">🔍 Proof: {s.evidence}</p>}
            </button>
          ))}
        </div>
      </Section>

      {series.length > 2 && (
        <Section title="Sleep vs your normal">
          <div className="card h-56 p-3 pr-5">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 10, left: -20 }}>
                <defs><linearGradient id="sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--sky)" stopOpacity={0.55} /><stop offset="1" stopColor="var(--sky)" stopOpacity={0.04} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axis} domain={[3, 10]} />
                <Tooltip {...tip} formatter={(v) => [`${v} h`, 'sleep']} />
                {Number.isFinite(normal) && <ReferenceLine y={round1(normal)} stroke="var(--dusk)" strokeWidth={1.5} strokeDasharray="5 5" label={{ value: `your normal ${round1(normal)} h`, fill: 'var(--ink-soft)', fontSize: 11, position: 'insideTopLeft' }} />}
                <Area type="basis" dataKey="sleep" stroke="color-mix(in oklab, var(--accent) 55%, var(--sky))" strokeWidth={2.5} fill="url(#sl)" dot={false} connectNulls animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {series.length > 2 && (
        <Section title="Mood & energy">
          <div className="card h-52 p-3 pr-5">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 10, left: -20 }}>
                <defs>
                  <linearGradient id="md" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--dusk)" stopOpacity={0.45} /><stop offset="1" stopColor="var(--dusk)" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="en" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--haldi)" stopOpacity={0.25} /><stop offset="1" stopColor="var(--haldi)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axis} domain={[1, 5]} ticks={[1, 3, 5]} />
                <Tooltip {...tip} />
                <Area type="basis" dataKey="energy" stroke="var(--haldi)" strokeWidth={2} fill="url(#en)" dot={false} animationDuration={1400} />
                <Area type="basis" dataKey="mood" stroke="var(--accent)" strokeWidth={2.5} fill="url(#md)" dot={false} animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex gap-4 px-1 text-xs text-ink-faint"><span><b className="text-accent">—</b> mood</span><span><b className="text-haldi">—</b> energy</span></p>
        </Section>
      )}

      {rhr.length > 2 && (
        <Section title="Resting heart rate">
          <div className="card h-44 p-3 pr-5">
            <ResponsiveContainer>
              <LineChart data={rhr} margin={{ top: 10, left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axis} domain={['dataMin - 3', 'dataMax + 3']} />
                <Tooltip {...tip} formatter={(v) => [`${Math.round(+(v ?? 0))} bpm`, 'resting HR']} />
                <Line type="basis" dataKey="v" stroke="var(--pista)" strokeWidth={2.5} dot={false} animationDuration={1400} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="This week, in a breath">
        <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line p-0">
          <Fact k="check-ins" v={String(week.length)} />
          <Fact k="average mood" v={week.length ? `${round1(mean(week.map((w) => w.mood)))}/5` : '–'} />
          <Fact k="brightest day" v={best ? new Date(best.day + 'T12:00').toLocaleDateString('en-IN', { weekday: 'long' }) : '–'} />
          <Fact k="most common" v={topTag ?? '–'} />
          <Fact k="gratitude notes" v={String(grat)} />
          <Fact k="minutes in rooms" v={String(roomMin)} />
        </div>
      </Section>

      <Section title="Support ladder">
        <div className="card mb-3 p-3"><SupportPath rung={d.weather.rung} className="block w-full" /></div>
        <ol className="space-y-2">
          {LADDER.map((l) => (
            <li key={l.rung} className={`card flex gap-4 p-4 ${l.rung === d.weather.rung ? 'ring-2 ring-haldi' : 'opacity-80'}`}>
              <span className="display text-3xl text-ink-faint">{l.rung + 1}</span>
              <div>
                <p className="font-semibold">{l.title} {l.rung === d.weather.rung && <Stamp color="var(--haldi)">suggested now</Stamp>}</p>
                <p className="mt-1 text-sm text-ink-soft">{l.body}</p>
                {l.rung === 3 && (
                  <div className="mt-3 flex gap-2">
                    <a className="btn btn-urgent py-2 text-sm" href="tel:14416">Call 14416</a>
                    <a className="btn btn-ghost py-2 text-sm" href="tel:112">112</a>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </Screen>
  )
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="bg-card p-4">
    <p className="display text-2xl capitalize">{v}</p>
    <p className="text-xs text-ink-faint">{k}</p>
  </div>
)
