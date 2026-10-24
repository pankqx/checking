import { useSyncExternalStore } from 'react'
import { connectHeartRate, rmssd } from './ble'
import { db, dayKey } from './db'

// Live heart rate from a watch/strap. Stored as one averaged sample per
// minute; a daily "resting" estimate is the 10th percentile of those minutes.

interface State { status: 'idle' | 'connecting' | 'live' | 'error'; name?: string; bpm?: number; hrv?: number; error?: string }
let state: State = { status: 'idle' }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const useWatch = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)

let disconnect: (() => void) | null = null
let minute: number[] = []
let rr: number[] = []
let timer = 0

export async function connectWatch() {
  set({ status: 'connecting', error: undefined })
  try {
    const link = await connectHeartRate(
      (r) => {
        minute.push(r.bpm)
        rr = [...rr, ...r.rr].slice(-60)
        set({ bpm: r.bpm, hrv: rr.length > 10 ? Math.round(rmssd(rr)) : undefined })
      },
      () => { clearInterval(timer); disconnect = null; set({ status: 'idle', bpm: undefined }) },
    )
    disconnect = link.disconnect
    set({ status: 'live', name: link.name })
    timer = window.setInterval(flush, 60_000)
    await db.profile.update('me', { watchOptIn: true })
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

export function disconnectWatch() {
  flush()
  clearInterval(timer)
  disconnect?.()
}

export const restingFrom = (minuteAvgs: number[]) => {
  const s = [...minuteAvgs].sort((a, b) => a - b)
  return s[Math.floor(s.length * 0.1)]
}

async function flush() {
  if (!minute.length) return
  const avg = minute.reduce((a, b) => a + b, 0) / minute.length
  minute = []
  const day = dayKey()
  await db.health.add({ at: Date.now(), day, kind: 'hr', value: Math.round(avg), source: 'ble' })
  if (state.hrv) await db.health.add({ at: Date.now(), day, kind: 'hrv', value: state.hrv, source: 'ble' })
  const today = await db.health.where({ day, kind: 'hr' }).toArray()
  if (today.length >= 5) {
    await db.health.where({ day, kind: 'restingHr' }).delete()
    await db.health.add({ at: Date.now(), day, kind: 'restingHr', value: restingFrom(today.map((t) => t.value)), source: 'ble' })
  }
}
