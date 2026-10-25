import { dayKey, type CheckIn, type Habit, type HealthSample, type Task } from './db'

// Code calculates. The AI only explains. Every number shown in the app comes
// from these pure functions, so they are unit tested (analysis.test.ts).
//
// The problem statement lists the early signs of burnout: academic pressure,
// poor sleep, isolation, exhaustion, loss of motivation and changes in
// everyday behaviour. MindMirror watches one signal for each, always compared
// with the student's OWN normal, never with a population rule. Signals combine
// into "mind weather", a non-diagnostic summary that decides which rung of the
// support ladder to offer.

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
export const round1 = (x: number) => Math.round(x * 10) / 10

export interface Point { day: string; v: number }

/** Personal baseline: recent window vs the window before it. */
export function baseline(values: Point[], recentDays = 3, baseDays = 14) {
  const sorted = [...values].filter((x) => Number.isFinite(x.v)).sort((a, b) => a.day.localeCompare(b.day))
  const recent = sorted.slice(-recentDays)
  const base = sorted.slice(-(recentDays + baseDays), -recentDays)
  const b = mean(base.map((x) => x.v))
  const r = mean(recent.map((x) => x.v))
  return { baseline: b, recent: r, delta: r - b, enough: base.length >= 5 && recent.length >= Math.min(2, recentDays) }
}

export interface PressureDay { day: string; due: number; planned: number; gap: number; tasks: Task[] }

/** PressureMap: hours of work due per day vs hours the student planned for it. */
export function pressureMap(tasks: Task[], days = 7, from = new Date()): PressureDay[] {
  const out: PressureDay[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const key = dayKey(d)
    const t = tasks.filter((x) => !x.done && x.due === key)
    const due = t.reduce((a, x) => a + x.hours, 0)
    const planned = t.reduce((a, x) => a + x.plannedHours, 0)
    out.push({ day: key, due, planned, gap: round1(due - planned), tasks: t })
  }
  return out
}

export function moodSeries(checkins: CheckIn[]) {
  const byDay = new Map<string, CheckIn[]>()
  for (const c of checkins) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c])
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cs]) => ({
      day,
      mood: round1(mean(cs.map((c) => c.mood))),
      energy: round1(mean(cs.map((c) => c.energy))),
      sleep: cs.find((c) => c.sleep != null)?.sleep,
      stress: round1(mean(cs.map((c) => c.stress ?? 3))),
      social: cs.some((c) => c.social != null) ? mean(cs.filter((c) => c.social != null).map((c) => c.social!)) : undefined,
      hour: mean(cs.map((c) => lateHour(c.at))),
    }))
}

/** Hour of day where 0–5 a.m. counts as 24–29, so "later" is always bigger. */
export const lateHour = (at: number) => {
  const d = new Date(at)
  const h = d.getHours() + d.getMinutes() / 60
  return h < 5 ? h + 24 : h
}

export function healthDaily(samples: HealthSample[], kind: HealthSample['kind']): Point[] {
  const byDay = new Map<string, number[]>()
  for (const s of samples) if (s.kind === kind) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.value])
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vs]) => ({ day, v: kind === 'steps' ? vs.reduce((a, b) => a + b, 0) : mean(vs) }))
}

/** Share of habits completed per day, 0..1. */
export function habitSeries(habits: Habit[], days = 17, today = new Date()): Point[] {
  if (!habits.length) return []
  const out: Point[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const k = dayKey(d)
    out.push({ day: k, v: habits.filter((h) => h.days.includes(k)).length / habits.length })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Early signals                                                       */
/* ------------------------------------------------------------------ */

export type SignalId = 'sleep' | 'pressure' | 'connection' | 'energy' | 'drive' | 'rhythm'
export type Level = 'steady' | 'shifting' | 'strained' | 'unknown'

export interface Signal {
  id: SignalId
  label: string
  level: Level
  headline: string
  evidence: string
  delta?: string
}

export interface Inputs {
  checkins: CheckIn[]
  tasks: Task[]
  health: HealthSample[]
  habits: Habit[]
  usualSleep?: number
  today?: Date
}

export const SIGNAL_META: Record<SignalId, { label: string; sign: string; color: string }> = {
  sleep: { label: 'Sleep', sign: 'poor sleep', color: 'var(--neel)' },
  pressure: { label: 'Pressure', sign: 'academic pressure', color: 'var(--dusk)' },
  connection: { label: 'Connection', sign: 'isolation', color: 'var(--gulabi)' },
  energy: { label: 'Energy', sign: 'exhaustion', color: 'var(--haldi)' },
  drive: { label: 'Drive', sign: 'loss of motivation', color: 'var(--pista)' },
  rhythm: { label: 'Rhythm', sign: 'changes in daily behaviour', color: 'var(--ink-soft)' },
}

const sig = (id: SignalId, level: Level, headline: string, evidence: string, delta?: string): Signal => ({ id, label: SIGNAL_META[id].label, level, headline, evidence, delta })

export function sleepSignal({ checkins, health, usualSleep }: Inputs): Signal {
  const fromCheckins = moodSeries(checkins).filter((s) => s.sleep != null).map((s) => ({ day: s.day, v: s.sleep! }))
  const pts = fromCheckins.length >= 6 ? fromCheckins : healthDaily(health, 'sleep')
  const b = baseline(pts)
  const normal = usualSleep ?? b.baseline
  if (!b.enough && !(usualSleep && pts.length >= 2)) return sig('sleep', 'unknown', 'Still learning your sleep', `${pts.length} nights logged`)
  const d = b.recent - normal
  const level: Level = d <= -1.25 ? 'strained' : d <= -0.75 ? 'shifting' : 'steady'
  return sig('sleep', level,
    level === 'steady' ? `Sleeping close to your normal (${round1(b.recent)} h)` : `${round1(b.recent)} h lately vs your usual ${round1(normal)} h`,
    `Average of your last 3 nights vs ${usualSleep ? 'the usual you told me' : 'your previous 14 nights'}`,
    `${d > 0 ? '+' : ''}${round1(d)} h`)
}

export function pressureSignal({ tasks, checkins, today = new Date() }: Inputs): Signal {
  const pm = pressureMap(tasks, 3, today)
  const gap = round1(pm.reduce((a, p) => a + Math.max(0, p.gap), 0))
  const due = round1(pm.reduce((a, p) => a + p.due, 0))
  const stress = baseline(moodSeries(checkins).map((s) => ({ day: s.day, v: s.stress })))
  const stressUp = stress.enough && stress.delta >= 0.7
  const level: Level = gap >= 5 || (gap >= 2 && stressUp) ? 'strained' : gap >= 2 || stressUp ? 'shifting' : 'steady'
  if (!tasks.length && !stress.enough) return sig('pressure', 'unknown', 'Add deadlines to see your PressureMap', 'No tasks yet')
  return sig('pressure', level,
    gap > 0 ? `${due} h due in 3 days, ${gap} h of it unplanned` : `Your plan covers what's due (${due} h)`,
    `Task estimates due in the next 3 days vs hours you planned${stressUp ? ', plus stress check-ins rising' : ''}`,
    gap > 0 ? `${gap} h gap` : undefined)
}

export function connectionSignal({ checkins }: Inputs): Signal {
  const pts = moodSeries(checkins).filter((s) => s.social != null).map((s) => ({ day: s.day, v: s.social! }))
  const b = baseline(pts, 4, 14)
  if (!b.enough) return sig('connection', 'unknown', 'Still learning your social rhythm', `${pts.length} days answered`)
  const level: Level = b.recent <= 0.5 && b.baseline >= 1 ? 'strained' : b.delta <= -0.6 ? 'shifting' : 'steady'
  const pct = Math.round((b.recent / 2) * 100)
  return sig('connection', level,
    level === 'steady' ? 'Connected about as much as usual' : `Fewer good conversations than usual lately`,
    'How often you said you talked to someone you like, last 4 days vs prior 14',
    `${pct}% vs ${Math.round((b.baseline / 2) * 100)}%`)
}

export function energySignal({ checkins, health }: Inputs): Signal {
  const e = baseline(moodSeries(checkins).map((s) => ({ day: s.day, v: s.energy })))
  const hr = baseline(healthDaily(health, 'restingHr'))
  const low = e.enough && e.delta <= -0.7
  const hrUp = hr.enough && hr.delta >= 4
  if (!e.enough && !hr.enough) return sig('energy', 'unknown', 'Still learning your energy', 'Need ~a week of check-ins')
  const level: Level = low && hrUp ? 'strained' : low || hrUp ? 'shifting' : 'steady'
  const parts = [e.enough ? `energy ${round1(e.recent)}/5 vs ${round1(e.baseline)}` : '', hr.enough ? `resting HR ${Math.round(hr.recent)} vs ${Math.round(hr.baseline)} bpm` : ''].filter(Boolean)
  return sig('energy', level,
    level === 'steady' ? 'Energy is around your normal' : hrUp && low ? 'Body and mind both running low' : hrUp ? 'Your body is working harder than usual' : 'Energy dipping below your normal',
    `Last 3 days vs prior 14: ${parts.join(', ')}`,
    hrUp ? `+${Math.round(hr.delta)} bpm` : e.enough ? `${round1(e.delta)}` : undefined)
}

export function driveSignal({ habits, tasks, today = new Date() }: Inputs): Signal {
  const hs = habitSeries(habits, 17, today)
  const b = baseline(hs, 5, 12)
  const todayKey = dayKey(today)
  const overdue = tasks.filter((t) => !t.done && t.due < todayKey).length
  if (!hs.length && !tasks.length) return sig('drive', 'unknown', 'Add a habit or two to see your drive', 'No habits yet')
  const drop = b.enough ? b.baseline - b.recent : 0
  const level: Level = drop >= 0.45 || overdue >= 3 ? 'strained' : drop >= 0.25 || overdue >= 2 ? 'shifting' : 'steady'
  return sig('drive', level,
    level === 'steady' ? 'Keeping up with the things you care about' : drop >= 0.25 ? 'Habits slipping compared with your usual' : `${overdue} tasks have slipped past their date`,
    `Habit completion, last 5 days vs prior 12${overdue ? `; ${overdue} overdue tasks` : ''}`,
    b.enough ? `${Math.round(b.recent * 100)}% vs ${Math.round(b.baseline * 100)}%` : undefined)
}

export function rhythmSignal({ checkins, health }: Inputs): Signal {
  const steps = baseline(healthDaily(health, 'steps'))
  const hour = baseline(moodSeries(checkins).map((s) => ({ day: s.day, v: s.hour })))
  const stepDrop = steps.enough && steps.baseline > 0 ? (steps.baseline - steps.recent) / steps.baseline : 0
  const later = hour.enough ? hour.delta : 0
  if (!steps.enough && !hour.enough) return sig('rhythm', 'unknown', 'Still learning your daily rhythm', 'Need ~a week of data')
  const level: Level = stepDrop >= 0.45 || later >= 2.5 ? 'strained' : stepDrop >= 0.3 || later >= 1.5 ? 'shifting' : 'steady'
  const bits = [steps.enough ? `steps ${Math.round(steps.recent)} vs ${Math.round(steps.baseline)}` : '', hour.enough ? `check-ins ${round1(later)} h ${later >= 0 ? 'later' : 'earlier'}` : ''].filter(Boolean)
  return sig('rhythm', level,
    level === 'steady' ? 'Your days look like your usual days' : stepDrop >= 0.3 ? 'Moving a lot less than usual' : 'Your days are shifting later into the night',
    `Last 3 days vs prior 14: ${bits.join(', ')}`,
    stepDrop >= 0.3 ? `−${Math.round(stepDrop * 100)}% steps` : later >= 1.5 ? `+${round1(later)} h later` : undefined)
}

export function signals(i: Inputs): Signal[] {
  return [sleepSignal(i), pressureSignal(i), connectionSignal(i), energySignal(i), driveSignal(i), rhythmSignal(i)]
}

/* ------------------------------------------------------------------ */
/* Mind weather + support ladder                                        */
/* ------------------------------------------------------------------ */

export interface Weather { score: number; name: string; line: string; rung: 0 | 1 | 2 }

/** Not a diagnosis: a plain summary of how many of your own signals moved. */
export function weather(ss: Signal[]): Weather {
  const score = ss.reduce((a, s) => a + (s.level === 'strained' ? 2 : s.level === 'shifting' ? 1 : 0), 0)
  const known = ss.filter((s) => s.level !== 'unknown').length
  if (known < 2) return { score, name: 'Getting to know you', line: 'A few more check-ins and I can compare you with your own normal.', rung: 0 }
  if (score <= 1) return { score, name: 'Clear skies', line: 'Nothing unusual compared with your normal.', rung: 0 }
  if (score <= 3) return { score, name: 'A few clouds', line: 'A couple of things have shifted. Small adjustments help most now.', rung: 0 }
  if (score <= 5) return { score, name: 'Overcast', line: 'Several signals moved together. This is a good time to lean on someone.', rung: 1 }
  return { score, name: 'Heavy skies', line: 'A lot has shifted at once. Talking to a counsellor early really helps.', rung: 2 }
}

export const LADDER = [
  { rung: 0, title: 'Look after yourself', body: 'Small, doable things: sleep a bit earlier, move one deadline, breathe for 2 minutes.' },
  { rung: 1, title: 'Reach out to someone', body: 'Message a friend, sibling or mentor you trust. You don’t have to explain everything.' },
  { rung: 2, title: 'Talk to a counsellor', body: 'Your campus counsellor is there for exactly this, before things get heavy. It’s confidential.' },
  { rung: 3, title: 'Urgent help, right now', body: 'Tele-MANAS 14416 (free, 24×7) or emergency 112.' },
] as const

/* ------------------------------------------------------------------ */
/* Insight cards                                                        */
/* ------------------------------------------------------------------ */

export interface Insight {
  id: string
  tone: 'calm' | 'nudge' | 'care'
  title: string
  body: string
  proof: string
  metric?: { label: string; value: string }
  action?: { label: string; route: string }
}

const ACTIONS: Record<SignalId, { body: string; action: Insight['action'] }> = {
  sleep: { body: 'No single night looks bad; the slow drift does. Try winding down 20 minutes earlier tonight.', action: { label: '4-7-8 sleep breath', route: 'meditation' } },
  pressure: { body: 'Could the biggest task move, or be split into a 30-minute first step?', action: { label: 'Open planner', route: 'planner' } },
  connection: { body: 'Isolation creeps in quietly. One message to someone you like counts.', action: { label: 'Write it down first', route: 'thoughts' } },
  energy: { body: 'That usually means tiredness, stress or a cold coming. Go gently today.', action: { label: 'See body data', route: 'body' } },
  drive: { body: 'Motivation dips are normal under load. Pick just one habit to keep today.', action: { label: 'Habits', route: 'planner' } },
  rhythm: { body: 'Late nights and less movement often travel together. A 10-minute walk is a strong reset.', action: { label: 'Release some pressure', route: 'release' } },
}

export function buildInsights(i: Inputs): Insight[] {
  const ss = signals(i)
  const out: Insight[] = ss
    .filter((s) => s.level === 'shifting' || s.level === 'strained')
    .sort((a, b) => (a.level === 'strained' ? -1 : 0) - (b.level === 'strained' ? -1 : 0))
    .map((s) => ({
      id: s.id,
      tone: s.level === 'strained' ? 'care' : 'nudge',
      title: s.headline,
      body: ACTIONS[s.id].body,
      proof: s.evidence,
      metric: s.delta ? { label: s.label, value: s.delta } : undefined,
      action: ACTIONS[s.id].action,
    }))

  const mood = baseline(moodSeries(i.checkins).map((s) => ({ day: s.day, v: s.mood })))
  if (mood.enough && mood.delta >= 0.5)
    out.push({ id: 'mood-up', tone: 'calm', title: 'Something is working', body: `You've felt brighter than usual (${round1(mood.recent)} vs ${round1(mood.baseline)} out of 5). Worth noticing what changed.`, proof: 'Average mood, last 3 days vs prior 14', metric: { label: 'mood', value: `+${round1(mood.delta)}` } })
  const steady = ss.filter((s) => s.level === 'steady')
  if (steady.length && out.length < 4)
    out.push({ id: 'steady', tone: 'calm', title: `${steady.map((s) => s.label).join(', ')} look steady`, body: 'Compared with your own normal, these are holding well. That counts.', proof: `${steady.length} of 6 signals at your usual level` })
  if (!out.length)
    out.push({ id: 'learning', tone: 'calm', title: 'Getting to know you', body: `A few more check-ins and I can compare you with your own normal. No rush.`, proof: `${i.checkins.length} check-ins so far` })
  return out
}

/* ------------------------------------------------------------------ */
/* Safety                                                               */
/* ------------------------------------------------------------------ */

const CRISIS = [/suicid/i, /kill (myself|me)/i, /end (it all|my life)/i, /self[- ]?harm/i, /don'?t want to (live|be here|exist)/i, /hurt(ing)? myself/i, /no reason to live/i, /better off without me/i, /cut(ting)? myself/i]
export const isCrisis = (t: string) => CRISIS.some((r) => r.test(t))
