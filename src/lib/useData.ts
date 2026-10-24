import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { buildInsights, signals, weather } from './analysis'
import { db, dayKey } from './db'

/** One live view of everything, plus the derived signals. */
export function useData() {
  const profile = useLiveQuery(() => db.profile.get('me'), [])
  const checkins = useLiveQuery(() => db.checkins.orderBy('at').toArray(), []) ?? []
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const health = useLiveQuery(() => db.health.toArray(), []) ?? []
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const thoughts = useLiveQuery(() => db.thoughts.orderBy('at').reverse().toArray(), []) ?? []

  return useMemo(() => {
    const inputs = { checkins, tasks, health, habits, usualSleep: profile?.usualSleep }
    const ss = signals(inputs)
    const today = checkins.filter((c) => c.day === dayKey())
    return {
      profile,
      checkins,
      tasks,
      health,
      habits,
      thoughts,
      signals: ss,
      weather: weather(ss),
      insights: buildInsights(inputs),
      todayCheckin: today[today.length - 1],
      lastMood: checkins[checkins.length - 1]?.mood ?? 3,
    }
  }, [profile, checkins, tasks, health, habits, thoughts])
}
