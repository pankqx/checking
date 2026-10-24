import { motion } from 'framer-motion'
import { useState } from 'react'
import { Screen, Section, Stamp } from '../components/ui'
import { pressureMap } from '../lib/analysis'
import { db, dayKey } from '../lib/db'
import { useData } from '../lib/useData'

const label = (k: string) => {
  const t = dayKey()
  const tm = dayKey(Date.now() + 86400000)
  return k === t ? 'Today' : k === tm ? 'Tomorrow' : new Date(k + 'T12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Planner() {
  const d = useData()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(dayKey(Date.now() + 86400000))
  const [hours, setHours] = useState(2)
  const [planned, setPlanned] = useState(1)
  const [habit, setHabit] = useState('')
  const pm = pressureMap(d.tasks, 7)
  const overdue = d.tasks.filter((t) => !t.done && t.due < dayKey())
  const last7 = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * 86400000))

  const add = async () => {
    if (!title.trim()) return
    await db.tasks.add({ title: title.trim(), due, hours, plannedHours: planned, done: false })
    setTitle('')
  }

  const moveLater = async (id: number, from: string) => {
    const next = new Date(from + 'T12:00')
    next.setDate(next.getDate() + 1)
    await db.tasks.update(id, { due: dayKey(next) })
  }

  return (
    <Screen title={<>Plan, <span className="display-i text-sindoor">kindly</span>.</>} kicker="to-do · planner · habits">
      <div className="card p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a task, e.g. Lab report" className="w-full bg-transparent text-lg outline-none" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <label className="flex flex-col gap-1 text-ink-faint">due<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-xl bg-paper-2 px-2 py-1.5 text-ink" /></label>
          <label className="flex flex-col gap-1 text-ink-faint">work needs<Stepper v={hours} set={setHours} /></label>
          <label className="flex flex-col gap-1 text-ink-faint">I&rsquo;ve planned<Stepper v={planned} set={setPlanned} /></label>
        </div>
        <button className="btn mt-3 w-full" onClick={add} disabled={!title.trim()}>Add</button>
      </div>

      {overdue.length > 0 && (
        <p className="mt-4 rounded-2xl bg-paper-2 p-3 text-sm text-ink-soft">{overdue.length} task{overdue.length > 1 ? 's' : ''} slipped past {overdue.length > 1 ? 'their dates' : 'its date'}. That happens. Give {overdue.length > 1 ? 'them' : 'it'} a new, realistic day?</p>
      )}

      <Section title="PressureMap">
        <div className="space-y-2">
          {pm.filter((p) => p.tasks.length).map((p) => (
            <div key={p.day} className="card rounded-3xl p-4" style={p.gap >= 2 ? { borderColor: 'var(--sindoor)' } : undefined}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{label(p.day)}</p>
                {p.gap >= 2 ? <Stamp>{p.gap} h unplanned</Stamp> : <Stamp color="var(--pista)">fits</Stamp>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full bg-neel" style={{ width: `${Math.min(100, (p.planned / Math.max(p.due, 0.1)) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-faint">{p.planned} of {p.due} h planned</p>
              <ul className="mt-3 space-y-1">
                {p.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <button onClick={() => db.tasks.update(t.id!, { done: true })} className="size-5 shrink-0 rounded-md border-2 border-ink" aria-label="Mark done" />
                    <span className="flex-1">{t.title} <span className="text-xs text-ink-faint">{t.hours} h</span></span>
                    {p.gap >= 2 && <button onClick={() => moveLater(t.id!, t.due)} className="text-xs text-sindoor underline underline-offset-2">move +1 day</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!pm.some((p) => p.tasks.length) && <p className="text-ink-faint">Nothing due this week. Breathe.</p>}
        </div>
      </Section>

      {overdue.length > 0 && (
        <Section title="Slipped">
          <ul className="card space-y-2 p-4">
            {overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{t.title}</span>
                <button className="text-sindoor underline" onClick={() => db.tasks.update(t.id!, { due: dayKey(Date.now() + 86400000) })}>tomorrow</button>
                <button className="text-ink-faint underline" onClick={() => db.tasks.update(t.id!, { done: true })}>done</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Habits">
        <div className="card p-4">
          <div className="mb-2 grid grid-cols-[1fr_repeat(7,28px)] items-center gap-1 text-center text-[10px] text-ink-faint">
            <span />
            {last7.map((k) => <span key={k}>{new Date(k + 'T12:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>)}
          </div>
          {d.habits.map((h) => (
            <div key={h.id} className="grid grid-cols-[1fr_repeat(7,28px)] items-center gap-1 py-1">
              <span className="truncate text-sm">{h.glyph} {h.name}</span>
              {last7.map((k) => {
                const on = h.days.includes(k)
                return (
                  <motion.button key={k} whileTap={{ scale: 0.8 }} onClick={() => db.habits.update(h.id!, { days: on ? h.days.filter((x) => x !== k) : [...h.days, k] })} className="size-7 rounded-full border-2 border-line" style={on ? { background: 'var(--pista)', borderColor: 'var(--pista)' } : undefined} aria-label={`${h.name} ${k}`} />
                )
              })}
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <input value={habit} onChange={(e) => setHabit(e.target.value)} placeholder="New habit, e.g. Walk 15 min" className="flex-1 rounded-full bg-paper-2 px-4 py-2 text-sm outline-none" />
            <button className="btn py-2 text-sm" disabled={!habit.trim()} onClick={async () => { await db.habits.add({ name: habit.trim(), glyph: '•', days: [] }); setHabit('') }}>Add</button>
          </div>
        </div>
      </Section>
    </Screen>
  )
}

function Stepper({ v, set }: { v: number; set: (n: number) => void }) {
  return (
    <span className="flex items-center justify-between rounded-xl bg-paper-2 px-1 text-ink">
      <button type="button" className="px-2 py-1" onClick={() => set(Math.max(0, v - 0.5))}>−</button>
      <span className="tabular-nums">{v}h</span>
      <button type="button" className="px-2 py-1" onClick={() => set(v + 0.5)}>+</button>
    </span>
  )
}
