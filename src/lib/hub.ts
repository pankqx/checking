import { useSyncExternalStore } from 'react'
import { isCrisis } from './analysis'
import { db, dayKey } from './db'

// The laptop hub (pankqx/MindMirror, hub/server.mjs) is where the necklace
// sends its audio. The hub transcribes it, writes a reply and announces every
// voice turn on /events. This app listens there, saves each turn (a check-in,
// a journal note and the chat lines) and speaks necklace replies on the laptop.

export interface Turn {
  at: number
  source: 'necklace' | 'web'
  heard: string
  reply: string
  mood: string
  signals: string[]
  audio?: string
}

type Status = 'off' | 'looking' | 'online' | 'thinking'
interface State { status: Status; url: string; thinking?: 'necklace' | 'web'; last?: Turn; lastAt: number }

const KEY = 'mm-hub'
const ON = 'mm-hub-on'

function initialUrl() {
  try {
    const q = new URLSearchParams(location.search).get('hub')
    if (q) { localStorage.setItem(KEY, q); localStorage.setItem(ON, '1'); return q.replace(/\/$/, '') }
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
  } catch { /* storage may be blocked */ }
  // Served by the hub's laptop (http://192.168.x.x:5173): the hub is on the same host.
  // On GitHub Pages (https) the browser may only reach the hub on this same laptop.
  return location.protocol === 'http:' && location.hostname ? `http://${location.hostname}:8787` : 'http://localhost:8787'
}

let state: State = { status: 'off', url: initialUrl(), lastAt: 0 }
const subs = new Set<() => void>()
const set = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach((f) => f()) }
export const useHub = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)
export const hubState = () => state

let es: EventSource | null = null
let retry: ReturnType<typeof setTimeout> | undefined
const turnListeners = new Set<(t: Turn) => void>()
export const onTurn = (f: (t: Turn) => void) => {
  turnListeners.add(f)
  return () => { turnListeners.delete(f) }
}

// Only listen once the student turns the necklace on (Voice mode or ?hub=):
// reaching a laptop address makes some browsers ask for local-network access.
export const hubEnabled = () => { try { return localStorage.getItem(ON) === '1' } catch { return false } }
export function enableHub(on: boolean) {
  try { localStorage.setItem(ON, on ? '1' : '0') } catch { /* storage may be blocked */ }
  if (on) connectHub()
  else { clearTimeout(retry); es?.close(); es = null; set({ status: 'off', thinking: undefined }) }
}

export function setHubUrl(url: string) {
  const u = url.trim().replace(/\/$/, '')
  try { localStorage.setItem(KEY, u) } catch { /* storage may be blocked */ }
  set({ url: u })
  connectHub()
}

/** Start listening to the hub. Safe to call again; it reconnects. */
export function connectHub() {
  clearTimeout(retry)
  es?.close()
  set({ status: 'looking' })
  try {
    es = new EventSource(`${state.url}/events`)
  } catch {
    set({ status: 'off' })
    return
  }
  es.onopen = () => set({ status: 'online' })
  es.onerror = () => {
    es?.close()
    es = null
    set({ status: 'off', thinking: undefined })
    if (hubEnabled()) retry = setTimeout(connectHub, 6000)
  }
  es.onmessage = (m) => {
    let e: { type: string; source?: 'necklace' | 'web'; at?: string; heard?: string; reply?: string; mood?: string; signals?: string[]; audio?: string }
    try { e = JSON.parse(m.data) } catch { return }
    if (e.type === 'thinking') set({ status: 'thinking', thinking: e.source ?? 'necklace' })
    else if (e.type === 'idle') set({ status: 'online', thinking: undefined })
    else if (e.type === 'turn') {
      const t: Turn = { at: e.at ? Date.parse(e.at) : Date.now(), source: e.source ?? 'necklace', heard: e.heard ?? '', reply: e.reply ?? '', mood: e.mood ?? 'okay', signals: e.signals ?? [], audio: e.audio }
      set({ status: 'online', thinking: undefined, last: t, lastAt: Date.now() })
      turnListeners.forEach((f) => f(t))
      saveTurn(t)
      // The necklace has no speaker of its own, so the laptop says the reply.
      if (t.source === 'necklace' && t.audio && document.visibilityState === 'visible') playReply(`${state.url}${t.audio}`)
    }
  }
}

let player: HTMLAudioElement | null = null
export function playReply(src: string) {
  player?.pause()
  player = new Audio(src)
  player.play().catch(() => {})
}

const MOOD: Record<string, { mood: number; energy: number; stress: number }> = {
  good: { mood: 4, energy: 4, stress: 2 },
  okay: { mood: 3, energy: 3, stress: 3 },
  low: { mood: 2, energy: 2, stress: 3 },
  stressed: { mood: 2, energy: 3, stress: 4 },
  tired: { mood: 2, energy: 1, stress: 3 },
}
const SIGNAL_TAG: Record<string, string> = { sleep: 'tired', pressure: 'deadlines', isolation: 'alone', energy: 'tired', motivation: 'bored' }

/** Saves one voice turn: chat lines, a voice check-in and a journal note. Skips a turn already saved (two open tabs). */
export async function saveTurn(t: Turn, via: 'necklace' | 'voice' = t.source === 'necklace' ? 'necklace' : 'voice') {
  if (!t.heard.trim()) return
  if (await db.chat.where('at').equals(t.at).count()) return
  const m = MOOD[t.mood] ?? MOOD.okay
  const tags = [...new Set(t.signals.map((s) => SIGNAL_TAG[s]).filter(Boolean))]
  await db.chat.add({ at: t.at, role: 'me', text: t.heard, source: 'necklace' })
  await db.chat.add({ at: t.at + 1, role: 'mirror', text: t.reply, source: 'necklace' })
  await db.checkins.add({ day: dayKey(), at: t.at, ...m, tags, note: t.heard, via })
  await db.thoughts.add({ at: t.at, kind: isCrisis(t.heard) || t.mood === 'stressed' ? 'worry' : 'thought', text: t.heard })
}

/** Sends a phone or laptop mic recording to the hub; resolves with the reply audio. The turn itself arrives on /events. */
export async function talkViaHub(audio: Blob): Promise<Blob> {
  const r = await fetch(`${state.url}/talk?src=web`, { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio })
  if (!r.ok) throw new Error(`hub ${r.status}`)
  return r.blob()
}
