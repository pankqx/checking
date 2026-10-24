import { useSyncExternalStore } from 'react'
import { buildInsights } from './analysis'
import { connectPendant, PendantCmd, type PendantLink } from './ble'
import { llmReply, ruleReply, llmReady } from './companion'
import { db, dayKey } from './db'
import { moodFromText, recordMic, speak, transcribe } from './voice'

// Lives outside React so the pendant stays connected while you move between
// screens. Pipeline: button down → stream ADPCM audio over BLE → button up →
// Whisper (on-device) → companion reply → haptic + text back to the pendant,
// spoken aloud by the phone.

export type PendantStatus = 'idle' | 'pairing' | 'connected' | 'listening' | 'thinking' | 'error'

interface State {
  status: PendantStatus
  name?: string
  battery?: number
  simulated: boolean
  error?: string
  lastHeard?: string
  lastReply?: string
  progress?: number
  level: number
}

let state: State = { status: 'idle', simulated: false, level: 0 }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}

let link: PendantLink | null = null
let chunks: Float32Array[] = []
let sim: Awaited<ReturnType<typeof recordMic>> | null = null
let raf = 0

export const usePendant = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  )

export async function pairPendant() {
  set({ status: 'pairing', error: undefined, simulated: false })
  try {
    link = await connectPendant({
      onAudio: (pcm) => {
        chunks.push(pcm)
        let s = 0
        for (let i = 0; i < pcm.length; i += 8) s += pcm[i] * pcm[i]
        set({ level: Math.sqrt(s / (pcm.length / 8)) })
      },
      onButton: (down) => (down ? startListening() : stopListening()),
      onBattery: (battery) => set({ battery }),
      onGone: () => { link = null; set({ status: 'idle', name: undefined }) },
    })
    set({ status: 'connected', name: link.name })
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

export function startSimulator() {
  link = { name: 'Phone mic (simulator)', send: async () => {}, disconnect: () => {} }
  set({ status: 'connected', name: link.name, simulated: true, battery: 100 })
}

export function unpair() {
  link?.disconnect()
  link = null
  set({ status: 'idle', name: undefined, simulated: false, battery: undefined })
}

export async function startListening() {
  chunks = []
  set({ status: 'listening', lastHeard: undefined, lastReply: undefined })
  link?.send(PendantCmd.listening)
  if (state.simulated) {
    sim = await recordMic()
    const tick = () => { if (sim) { set({ level: sim.level() }); raf = requestAnimationFrame(tick) } }
    tick()
  }
}

export async function stopListening() {
  if (state.status !== 'listening') return
  set({ status: 'thinking', level: 0 })
  link?.send(PendantCmd.thinking)
  let pcm: Float32Array
  if (sim) {
    cancelAnimationFrame(raf)
    pcm = await sim.stop()
    sim = null
  } else {
    const n = chunks.reduce((a, c) => a + c.length, 0)
    pcm = new Float32Array(n)
    let o = 0
    for (const c of chunks) { pcm.set(c, o); o += c.length }
  }
  try {
    const heard = pcm.length > 8000 ? await transcribe(pcm, (p) => set({ progress: p })) : ''
    set({ lastHeard: heard || '(didn’t catch that)', progress: undefined })
    if (!heard) { link?.send(PendantCmd.idle); set({ status: 'connected' }); return }
    const reply = await respond(heard)
    set({ lastReply: reply, status: 'connected' })
    await link?.send(PendantCmd.reply, reply)
    speak(reply)
  } catch (e) {
    set({ status: 'connected', error: e instanceof Error ? e.message : String(e) })
    link?.send(PendantCmd.idle)
  }
}

async function respond(text: string) {
  const [checkins, tasks, health, habits, profile] = await Promise.all([db.checkins.toArray(), db.tasks.toArray(), db.health.toArray(), db.habits.toArray(), db.profile.get('me')])
  const ctx = { name: profile?.name, insights: buildInsights({ checkins, tasks, health, habits, usualSleep: profile?.usualSleep }) }
  await db.chat.add({ at: Date.now(), role: 'me', text, source: 'necklace' })
  // A spoken "I feel…" doubles as a hands-free check-in, once a day.
  if (/\bi(?:'m| am)? (feel|feeling)\b|\bi'?m (so )?(tired|exhausted|stressed|anxious|happy|sad|okay|good|fine)\b/i.test(text) && !checkins.some((c) => c.day === dayKey())) {
    await db.checkins.add({ day: dayKey(), at: Date.now(), mood: moodFromText(text), energy: 3, tags: ['pendant'], note: text, via: 'necklace' })
  }
  const history = (await db.chat.orderBy('at').reverse().limit(8).toArray()).reverse()
  const reply = llmReady() ? await llmReply(history, ctx) : ruleReply(text, ctx)
  await db.chat.add({ at: Date.now(), role: 'mirror', text: reply, source: llmReady() ? 'llm' : 'rules' })
  return reply
}

export async function sendCalm(cycles = 4) {
  if (!link || state.simulated) return
  await link.send(PendantCmd.calm, String.fromCharCode(cycles))
}
