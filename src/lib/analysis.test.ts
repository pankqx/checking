import { describe, expect, it } from 'vitest'
import { baseline, buildInsights, connectionSignal, driveSignal, energySignal, isCrisis, lateHour, pressureMap, rhythmSignal, signals, sleepSignal, weather, type Inputs } from './analysis'
import { rmssd, parseHeartRate, AdpcmDecoder } from './ble'
import type { CheckIn, HealthSample, Task } from './db'
import { dayKey } from './db'
import { moodFromText } from './voice'
import { restingFrom } from './watchStore'

const TODAY = new Date('2026-10-24T12:00:00')
const day = (offset: number) => dayKey(new Date(TODAY.getTime() + offset * 86400000))

/** 17 days of check-ins; the last 3 use `recent`, the rest `usual`. */
function days(usual: Partial<CheckIn>, recent: Partial<CheckIn>, n = 17): CheckIn[] {
  return Array.from({ length: n }, (_, i) => {
    const off = i - n
    const r = n - i <= 3
    const at = new Date(TODAY.getTime() + off * 86400000)
    at.setHours(21, 0, 0, 0)
    return { day: day(off), at: +at, mood: 3, energy: 3, stress: 3, sleep: 7, social: 2, tags: [], via: 'tap', ...(r ? recent : usual) } as CheckIn
  })
}
const base = (p: Partial<Inputs>): Inputs => ({ checkins: [], tasks: [], health: [], habits: [], today: TODAY, ...p })

describe('baseline', () => {
  it('compares the recent window with the window before it', () => {
    const pts = [...Array.from({ length: 14 }, (_, i) => ({ day: day(i - 20), v: 7 })), ...[5.5, 5.5, 5.5].map((v, i) => ({ day: day(i - 3), v }))]
    const b = baseline(pts)
    expect(b.baseline).toBe(7)
    expect(b.recent).toBe(5.5)
    expect(b.delta).toBe(-1.5)
    expect(b.enough).toBe(true)
  })
  it('says when there is not enough history', () => {
    expect(baseline([{ day: day(-1), v: 6 }]).enough).toBe(false)
  })
})

describe('sleep signal (deck example: 7 h usual vs 5.5 h)', () => {
  it('flags a 1.5 h drift as strained', () => {
    const s = sleepSignal(base({ checkins: days({ sleep: 7 }, { sleep: 5.5 }), usualSleep: 7 }))
    expect(s.level).toBe('strained')
    expect(s.delta).toBe('-1.5 h')
  })
  it('flags 0.8 h as shifting and 0.3 h as steady', () => {
    expect(sleepSignal(base({ checkins: days({ sleep: 7 }, { sleep: 6.2 }), usualSleep: 7 })).level).toBe('shifting')
    expect(sleepSignal(base({ checkins: days({ sleep: 7 }, { sleep: 6.7 }), usualSleep: 7 })).level).toBe('steady')
  })
})

describe('PressureMap (deck example: 9 h due, 4 h planned)', () => {
  const tasks: Task[] = [
    { title: 'Lab report', due: day(1), hours: 5, plannedHours: 2, done: false },
    { title: 'Assignment', due: day(1), hours: 4, plannedHours: 2, done: false },
    { title: 'Done already', due: day(1), hours: 9, plannedHours: 0, done: true },
  ]
  it('sums open work due vs planned per day', () => {
    const pm = pressureMap(tasks, 3, TODAY)
    expect(pm[1]).toMatchObject({ day: day(1), due: 9, planned: 4, gap: 5 })
    expect(pm[0].due).toBe(0)
  })
  it('a 5 h gap is strained', () => {
    expect(signals(base({ tasks }))[1].level).toBe('strained')
  })
})

describe('connection, energy, drive, rhythm', () => {
  it('isolation: no good conversations for 4 days after a social baseline', () => {
    const c = days({ social: 2 }, { social: 0 }, 18).map((x, i, a) => (i >= a.length - 4 ? { ...x, social: 0 as const } : x))
    expect(connectionSignal(base({ checkins: c })).level).toBe('strained')
  })
  it('exhaustion: low energy plus resting HR up is strained', () => {
    const health: HealthSample[] = Array.from({ length: 17 }, (_, i) => ({ at: 0, day: day(i - 17), kind: 'restingHr', value: i >= 14 ? 72 : 64, source: 'demo' }))
    const s = energySignal(base({ checkins: days({ energy: 4 }, { energy: 2 }), health }))
    expect(s.level).toBe('strained')
    expect(s.delta).toBe('+8 bpm')
  })
  it('loss of motivation: habits drop from ~100% to 0%', () => {
    const doneDays = Array.from({ length: 12 }, (_, i) => day(i - 16))
    const s = driveSignal(base({ habits: [{ name: 'Walk', glyph: '', days: doneDays }] }))
    expect(s.level).toBe('strained')
  })
  it('behaviour change: check-ins 3.5 h later at night', () => {
    const c = days({}, {}).map((x, i, a) => (i >= a.length - 3 ? { ...x, at: x.at + 3.5 * 3600000 } : x))
    expect(rhythmSignal(base({ checkins: c })).level).toBe('strained')
  })
  it('lateHour treats 1 a.m. as later than 11 p.m.', () => {
    expect(lateHour(+new Date('2026-10-24T01:00:00'))).toBe(25)
    expect(lateHour(+new Date('2026-10-24T23:00:00'))).toBe(23)
  })
})

describe('mind weather + insights', () => {
  it('is calm with steady data and escalates the support rung as signals pile up', () => {
    const steady = signals(base({ checkins: days({}, {}) }))
    expect(weather(steady).rung).toBe(0)
    const heavy = signals(base({ checkins: days({ sleep: 7, energy: 4, social: 2 }, { sleep: 5, energy: 2, social: 0, stress: 5 }), usualSleep: 7, tasks: [{ title: 'x', due: day(1), hours: 8, plannedHours: 1, done: false }] }))
    expect(weather(heavy).rung).toBe(2)
  })
  it('every insight shows its proof', () => {
    const ins = buildInsights(base({ checkins: days({ sleep: 7 }, { sleep: 5.5 }), usualSleep: 7 }))
    expect(ins[0].id).toBe('sleep')
    for (const i of ins) expect(i.proof.length).toBeGreaterThan(5)
  })
})

describe('safety + helpers', () => {
  it('routes crisis wording to human help', () => {
    expect(isCrisis("I don't want to live anymore")).toBe(true)
    expect(isCrisis('I want to kill myself')).toBe(true)
    expect(isCrisis('this assignment is killing me lol')).toBe(false)
  })
  it('guesses mood from words', () => {
    expect(moodFromText("I'm tired and stressed")).toBeLessThan(3)
    expect(moodFromText('feeling good and calm today')).toBeGreaterThan(3)
    expect(moodFromText('not good')).toBeLessThan(3)
  })
  it('parses BLE heart-rate packets', () => {
    const v = new DataView(new Uint8Array([0x10, 72, 0x00, 0x04]).buffer)
    expect(parseHeartRate(v)).toMatchObject({ bpm: 72, rr: [1000] })
  })
  it('computes RMSSD and resting HR', () => {
    expect(rmssd([800, 810, 800, 810])).toBeCloseTo(10)
    expect(restingFrom([80, 62, 70, 75, 64, 90, 88, 66, 71, 73])).toBe(64)
  })
  it('decodes IMA-ADPCM without blowing up', () => {
    const out = new AdpcmDecoder().decode(new Uint8Array(64).fill(0x77))
    expect(out.length).toBe(128)
    expect(Math.max(...out)).toBeLessThanOrEqual(1)
  })
})
