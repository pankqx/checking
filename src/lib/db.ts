import Dexie, { type EntityTable } from 'dexie'

// Everything lives in this browser's IndexedDB. Nothing is sent to a server.

export interface Profile {
  id: 'me'
  name?: string
  pronoun?: string
  reasons: string[]
  usualSleep?: number
  studyHours?: number
  vibe?: string
  watchOptIn?: boolean
  onboardedAt?: number
}

export interface CheckIn {
  id?: number
  day: string // YYYY-MM-DD
  at: number
  mood: number // 1..5
  energy: number // 1..5
  sleep?: number // hours
  stress?: number // 1..5
  social?: 0 | 1 | 2 // talked to someone you like today? no / a little / yes
  tags: string[]
  note?: string
  via: 'tap' | 'voice' | 'necklace'
}

export interface Thought {
  id?: number
  at: number
  kind: 'thought' | 'gratitude' | 'worry'
  text: string
  released?: boolean
}

export interface Task {
  id?: number
  title: string
  due: string // YYYY-MM-DD
  hours: number
  plannedHours: number
  done: boolean
}

export interface HealthSample {
  id?: number
  at: number
  day: string
  kind: 'hr' | 'restingHr' | 'steps' | 'sleep' | 'hrv'
  value: number
  source: 'ble' | 'import' | 'demo'
}

export interface Session {
  id?: number
  at: number
  room: 'meditation' | 'release'
  activity: string
  minutes: number
}

export interface Habit {
  id?: number
  name: string
  glyph: string
  days: string[] // YYYY-MM-DD done
}

export interface ChatMsg {
  id?: number
  at: number
  role: 'me' | 'mirror'
  text: string
  source?: 'rules' | 'llm' | 'necklace'
}

export const db = new Dexie('mindmirror') as Dexie & {
  profile: EntityTable<Profile, 'id'>
  checkins: EntityTable<CheckIn, 'id'>
  thoughts: EntityTable<Thought, 'id'>
  tasks: EntityTable<Task, 'id'>
  health: EntityTable<HealthSample, 'id'>
  sessions: EntityTable<Session, 'id'>
  chat: EntityTable<ChatMsg, 'id'>
  habits: EntityTable<Habit, 'id'>
}

db.version(1).stores({
  profile: 'id',
  checkins: '++id, day, at',
  thoughts: '++id, at, kind',
  tasks: '++id, due, done',
  health: '++id, day, kind, at, [day+kind]',
  sessions: '++id, at, room',
  chat: '++id, at',
  habits: '++id',
})

export const dayKey = (d: Date | number = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export async function wipeEverything() {
  await db.delete()
  localStorage.clear()
  location.reload()
}
