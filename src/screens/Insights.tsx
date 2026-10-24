import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Orb } from '../components/Orb'
import { Screen, Section, Stamp } from '../components/ui'
import { healthDaily, LADDER, mean, moodSeries, round1, SIGNAL_META } from '../lib/analysis'
import { db, dayKey } from '../lib/db'
import { go, type Route } from '../lib/nav'
import { useData } from '../lib/useData'
import { LEVEL_STYLE } from './Home'

const short = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const axis = { stroke: 'var(--ink-faint)', fontSize: 11, tickLine: false, axisLine: false }
const tip = { contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 12, color: 'var(--ink)' } }

export default function Insights() {
  const d = useData()
  const [open, setOpen] = useState<string | null>(null)
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
    <Screen title={<>What&rsquo;s <span className="display-i text-sindoor">changed</span>?</>} kicker="insights · you vs your normal">
      <div className="card flex items-center gap-4 overflow-hidden p-5" style={{ background: 'linear-gradient(135deg, #2e3a8c, #5b3fa8 70%, #8a3f7a)', color: '#f3eee4', borderColor: 'transparent' }}>
        <Orb mood={d.lastMood} size={96} face={false} />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">Mind weather</p>
          <p className="display text-3xl">{d.weather.name}</p>
          <p className="mt-1 text-sm opacity-80">{d.weather.line}</p>
        </div>
      </div>
      <p className="mt-3 px-1 text-xs text-ink-faint">Not a diagnosis. Each signal compares your last few days with your own previous weeks.</p>

      <Section title="Insights for you">
        <div className="snap-row -mx-4">
          {d.insights.map((i) => (
            <div key={i.id} className="card flex w-[82%] flex-col p-5 sm:w-80" style={{ borderColor: i.tone === 'care' ? 'var(--sindoor)' : i.tone === 'nudge' ? 'var(--haldi)' : 'var(--pista)' }}>
              {i.metric && <p className="display text-4xl" style={{ color: i.tone === 'care' ? 'var(--sindoor)' : i.tone === 'nudge' ? 'var(--haldi)' : 'var(--pista)' }}>{i.metric.value}</p>}
              <p className="mt-1 text-lg font-semibold leading-snug">{i.title}</p>
              <p className="mt-2 text-sm text-ink-soft">{i.body}</p>
              <p className="mt-3 border-t border-dashed border-line pt-2 text-xs text-ink-faint">🔍 {i.proof}</p>
              {i.action && <button className="btn btn-ghost mt-4 self-start py-2 text-sm" onClick={() => go(i.action!.route as Route)}>{i.action.label} →</button>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Six early signals">
        <div className="space-y-2">
          {d.signals.map((s) => (
            <button key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className="card block w-full rounded-3xl p-4 text-left">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ background: LEVEL_STYLE[s.level].color }} />
                <span className="font-semibold">{s.label}</span>
                <span className="text-xs text-ink-faint">watches for {SIGNAL_META[s.id].sign}</span>
                <span className="ml-auto"><Stamp color={LEVEL_STYLE[s.level].color === 'var(--line)' ? 'var(--ink-faint)' : LEVEL_STYLE[s.level].color}>{LEVEL_STYLE[s.level].label}</Stamp></span>
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
                <defs><linearGradient id="sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--neel)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--neel)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axis} domain={[3, 10]} />
                <Tooltip {...tip} formatter={(v) => [`${v} h`, 'sleep']} />
                {Number.isFinite(normal) && <ReferenceLine y={round1(normal)} stroke="var(--sindoor)" strokeDasharray="5 4" label={{ value: `your normal ${round1(normal)} h`, fill: 'var(--sindoor)', fontSize: 11, position: 'insideTopLeft' }} />}
                <Area type="monotone" dataKey="sleep" stroke="var(--neel)" strokeWidth={2.5} fill="url(#sl)" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {series.length > 2 && (
        <Section title="Mood & energy">
          <div className="card h-52 p-3 pr-5">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 10, left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axis} domain={[1, 5]} ticks={[1, 3, 5]} />
                <Tooltip {...tip} />
                <Line type="monotone" dataKey="mood" stroke="var(--sindoor)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="energy" stroke="var(--haldi)" strokeWidth={2} strokeDasharray="1 0" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex gap-4 px-1 text-xs text-ink-faint"><span><b className="text-sindoor">—</b> mood</span><span><b className="text-haldi">—</b> energy</span></p>
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
                <Line type="monotone" dataKey="v" stroke="var(--pista)" strokeWidth={2.5} dot={false} />
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
        <ol className="space-y-2">
          {LADDER.map((l) => (
            <li key={l.rung} className={`card flex gap-4 p-4 ${l.rung === d.weather.rung ? 'ring-2 ring-haldi' : 'opacity-80'}`}>
              <span className="display text-3xl text-ink-faint">{l.rung + 1}</span>
              <div>
                <p className="font-semibold">{l.title} {l.rung === d.weather.rung && <Stamp color="var(--haldi)">suggested now</Stamp>}</p>
                <p className="mt-1 text-sm text-ink-soft">{l.body}</p>
                {l.rung === 3 && (
                  <div className="mt-3 flex gap-2">
                    <a className="btn bg-sindoor py-2 text-sm" href="tel:14416">Call 14416</a>
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
