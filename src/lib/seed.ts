import { db, dayKey, type CheckIn, type HealthSample, type Task } from './db'

// Demo data for judges: three weeks of a student whose sleep slowly drifts
// while deadlines pile up. Clearly labelled as sample data in the UI.

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

export async function seedDemo() {
  const r = rnd(42)
  const checkins: CheckIn[] = []
  const health: HealthSample[] = []
  const now = new Date()
  for (let i = 20; i >= 1; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    d.setHours(21, 0, 0, 0)
    const day = dayKey(d)
    const late = i <= 3
    if (late) d.setHours(24, 40 + i * 5, 0, 0) // checking in after midnight lately
    if (+d > Date.now()) d.setTime(Date.now() - 60_000)
    const sleep = Math.round((late ? 5.4 + r() * 0.6 : 6.8 + r() * 0.6) * 10) / 10
    checkins.push({
      day,
      at: +d,
      mood: Math.max(1, Math.min(5, Math.round(late ? 2 + r() * 1.4 : 3.2 + r() * 1.5))),
      energy: Math.max(1, Math.min(5, Math.round(late ? 2 + r() : 3 + r() * 1.5))),
      stress: Math.max(1, Math.min(5, Math.round(late ? 4 + r() : 2 + r() * 1.5))),
      sleep,
      social: late ? 0 : r() > 0.3 ? 2 : 1,
      tags: late ? ['deadlines', 'tired'] : r() > 0.5 ? ['friends'] : ['classes'],
      via: 'tap',
    })
    health.push({ at: +d, day, kind: 'restingHr', value: Math.round(late ? 71 + r() * 3 : 64 + r() * 3), source: 'demo' })
    health.push({ at: +d, day, kind: 'steps', value: Math.round(late ? 3200 + r() * 1500 : 6500 + r() * 3000), source: 'demo' })
    health.push({ at: +d, day, kind: 'sleep', value: sleep, source: 'demo' })
  }
  const t = (n: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + n)
    return dayKey(d)
  }
  const tasks: Task[] = [
    { title: 'Physics lab report', due: t(1), hours: 4, plannedHours: 1.5, done: false },
    { title: 'DBMS assignment 3', due: t(1), hours: 3, plannedHours: 1.5, done: false },
    { title: 'Read chapter 7 for quiz', due: t(1), hours: 2, plannedHours: 1, done: false },
    { title: 'Hackathon pitch practice', due: t(2), hours: 1.5, plannedHours: 1.5, done: false },
    { title: 'Maths problem set', due: t(4), hours: 3, plannedHours: 2, done: false },
  ]
  const habitDays = (keep: number, recentKeep: number) => {
    const out: string[] = []
    for (let i = 16; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      if (r() < (i <= 4 ? recentKeep : keep)) out.push(dayKey(d))
    }
    return out
  }
  await db.transaction('rw', [db.checkins, db.health, db.tasks, db.thoughts, db.habits], async () => {
    await db.habits.bulkAdd([
      { name: 'Drink water', glyph: '💧', days: habitDays(0.9, 0.6) },
      { name: 'Walk 15 min', glyph: '🚶', days: habitDays(0.8, 0.2) },
      { name: 'No phone in bed', glyph: '🌙', days: habitDays(0.6, 0.1) },
    ])
    await db.checkins.bulkAdd(checkins)
    await db.health.bulkAdd(health)
    await db.tasks.bulkAdd(tasks)
    await db.thoughts.bulkAdd([
      { at: +now - 86400000 * 3, kind: 'gratitude', text: 'Riha shared her notes before the quiz' },
      { at: +now - 86400000 * 2, kind: 'thought', text: 'I keep opening the lab report and closing it again.' },
      { at: +now - 86400000, kind: 'gratitude', text: 'Chai with the team after class' },
    ])
  })
  localStorage.setItem('mm-demo', '1')
}
