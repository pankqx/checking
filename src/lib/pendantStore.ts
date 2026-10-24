import { useSyncExternalStore } from 'react'
import { buildInsights } from './analysis'
import { AdpcmDecoder } from './adpcm'
import { connectNecklace, type NecklaceLink } from './ble'
import { getBuddy, hush, say } from './buddy'
import { llmReply, ruleReply, llmReady } from './companion'
import { db, dayKey } from './db'
import { Feature, LocalClip, Op, type AudioPacket, type NecklaceEvent } from './necklace/protocol'
import { makeClip, sendClip } from './necklace/transfer'
import { loadVoice, splitSentences, synthesize, type NecklaceVoice } from './necklace/voice'
import { loadWhisper, moodFromText, recordMic, transcribe } from './voice'

// Lives outside React so the necklace stays connected while you move between
// screens. One conversation turn:
//   button down -> ADPCM audio streams in -> button up (REC_DONE)
//   -> Whisper on the phone -> companion reply -> TTS on the phone
//   -> reply clips sent to the necklace -> necklace verifies and plays them
// The phone speaker is only used in simulator mode (no necklace paired).

export type PendantStatus =
  | 'idle' | 'pairing' | 'connected' | 'listening' | 'uploading' | 'processing'
  | 'receiving' | 'speaking' | 'done' | 'reconnecting' | 'error'

interface State {
  status: PendantStatus
  name?: string
  battery?: number
  simulated: boolean
  speaker: boolean
  error?: string
  note?: string
  lastHeard?: string
  lastReply?: string
  progress?: number
  warming?: number
  sent?: number
  level: number
  voice: NecklaceVoice
  volume: number
  fw?: string
}

const readLS = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

let state: State = {
  status: 'idle', simulated: false, speaker: false, level: 0,
  voice: readLS('mm-necklace-voice', 'quick') as NecklaceVoice,
  volume: Number(readLS('mm-necklace-volume', '70')),
}
const subs = new Set<() => void>()
const set = (p: Partial<State>) => {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}
export const usePendant = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)

let link: NecklaceLink | null = null
let sim: Awaited<ReturnType<typeof recordMic>> | null = null
let raf = 0

// ------------------------------------------------------------ recording
const decoder = new AdpcmDecoder()
let session = -1
let expectSeq = 0
let gaps = 0
let packets = 0
let chunks: Float32Array[] = []

function onAudio(p: AudioPacket) {
  if (p.session !== session || state.status !== 'listening') return
  if (p.seq !== expectSeq) gaps++
  expectSeq = p.seq + 1
  packets++
  const pcm = decoder.decode(p.adpcm)
  chunks.push(pcm)
  let s = 0
  for (let i = 0; i < pcm.length; i += 8) s += pcm[i] * pcm[i]
  set({ level: Math.sqrt(s / Math.max(1, pcm.length / 8)) })
}

function joined() {
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

// ---------------------------------------------------------- reply audio
let replyToken = 0
let clipCounter = 0
const clipText = new Map<number, { text: string; ms: number }>()
let keepAlive = 0

function startKeepAlive() {
  stopKeepAlive()
  keepAlive = window.setInterval(() => link?.send(Op.thinking).catch(() => {}), 5000)
  link?.send(Op.thinking).catch(() => {})
}
function stopKeepAlive() { clearInterval(keepAlive); keepAlive = 0 }

/** Speak a reply through the necklace's own speaker. Falls back to a stored necklace phrase, never to the phone speaker. */
export async function speakOnNecklace(text: string) {
  if (!link || state.simulated) { say(text, { expression: 'calm' }); return }
  if (!state.speaker) { set({ note: 'This necklace has no speaker. The reply is on screen.' }); return }
  const token = ++replyToken
  const sentences = splitSentences(text)
  set({ status: 'receiving', sent: 0, note: undefined })
  startKeepAlive()
  try {
    let next = synthesize(sentences[0], state.voice, getBuddy().character, (p) => set({ progress: p }))
    for (let i = 0; i < sentences.length; i++) {
      const pcm = await next
      set({ progress: undefined })
      if (token !== replyToken) return
      if (i + 1 < sentences.length) next = synthesize(sentences[i + 1], state.voice, getBuddy().character)
      const clip = makeClip(clipCounter++ % 0xf0, pcm, i === sentences.length - 1)
      clipText.set(clip.id, { text: sentences[i], ms: (pcm.length / 16000) * 1000 })
      await sendClip(link.transport, clip, (s, t) => set({ sent: s / t }))
    }
  } catch (e) {
    if (token !== replyToken) return
    console.warn('necklace reply failed', e)
    await link?.send(Op.playLocal, LocalClip.onScreen).catch(() => {})
    set({ status: 'connected', note: `The necklace said its stored line instead: ${e instanceof Error ? e.message : e}` })
  } finally {
    if (token === replyToken) stopKeepAlive()
  }
}

// --------------------------------------------------------------- events
let backToConnected = 0
function onEvent(e: NecklaceEvent) {
  switch (e.type) {
    case 'buttonDown':
      replyToken++ // barge-in: drop whatever reply was in flight
      stopKeepAlive()
      hush()
      session = e.session; expectSeq = 0; gaps = 0; packets = 0; chunks = []
      decoder.reset()
      set({ status: 'listening', lastHeard: undefined, lastReply: undefined, note: undefined, error: undefined })
      break
    case 'recDone':
      if (e.session === session && state.status === 'listening') void finishRecording(e.packets)
      break
    case 'battery': set({ battery: e.pct }); break
    case 'playStart': {
      const meta = clipText.get(e.clip)
      if (e.clip >= 0xf0) break // stored phrase
      set({ status: 'speaking' })
      if (meta) say(meta.text, { voice: false, durationMs: meta.ms, expression: 'calm' })
      break
    }
    case 'playDone': clipText.delete(e.clip); break
    case 'replyDone':
      stopKeepAlive()
      set({ status: 'done' })
      clearTimeout(backToConnected)
      backToConnected = window.setTimeout(() => state.status === 'done' && set({ status: 'connected' }), 1800)
      break
    case 'error': set({ note: `Necklace: ${e.message}` }); break
    case 'hello': set({ speaker: (e.features & Feature.speaker) !== 0, fw: e.fw }); break
  }
}

async function finishRecording(expected: number) {
  set({ status: 'uploading', level: 0 })
  const pcm = joined()
  if (gaps > 0 || packets < expected * 0.9) {
    await link?.send(Op.playLocal, LocalClip.retry).catch(() => {})
    set({ status: 'connected', note: 'Part of the recording went missing over Bluetooth. Try again closer to the phone.' })
    return
  }
  set({ status: 'processing' })
  startKeepAlive()
  try {
    const heard = pcm.length > 8000 ? await transcribe(pcm, (p) => set({ progress: p })) : ''
    set({ lastHeard: heard || '(didn’t catch that)', progress: undefined })
    if (!heard) {
      stopKeepAlive()
      await link?.send(Op.playLocal, LocalClip.retry)
      set({ status: 'connected' })
      return
    }
    const reply = await respond(heard)
    set({ lastReply: reply })
    await speakOnNecklace(reply)
  } catch (e) {
    stopKeepAlive()
    await link?.send(Op.playLocal, LocalClip.retry).catch(() => {})
    set({ status: 'connected', progress: undefined, note: `Couldn't understand that one (${e instanceof Error ? e.message : e}). The necklace asked you to try again.` })
  }
}

// -------------------------------------------------------------- pairing
let wakeLock: WakeLockSentinel | null = null
async function keepScreenOn() {
  try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null } catch { wakeLock = null }
}
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && link && !state.simulated) void keepScreenOn() })

function warmModels() {
  let a = 0, b = 0
  const show = () => set({ warming: a >= 100 && b >= 100 ? undefined : Math.round((a + b) / 2) })
  loadWhisper((p) => { a = p; show() }).then(() => { a = 100; show() }).catch(() => {})
  loadVoice(state.voice, (p) => { b = p; show() }).then(() => { b = 100; show() }).catch((e) => set({ warming: undefined, note: `Voice model failed to load: ${e instanceof Error ? e.message : e}` }))
}

async function onGone() {
  stopKeepAlive()
  replyToken++
  set({ status: 'reconnecting' })
  for (const wait of [1000, 2000, 4000, 8000, 8000]) {
    await new Promise((r) => setTimeout(r, wait))
    if (!link) return
    try {
      await link.reconnect()
      set({ status: 'connected', note: undefined })
      await link.send(Op.volume, state.volume)
      return
    } catch { /* try again */ }
  }
  link = null
  set({ status: 'error', error: 'Lost the necklace. Check it is switched on and charged, then pair again.' })
}

export async function pairPendant() {
  set({ status: 'pairing', error: undefined, note: undefined, simulated: false })
  try {
    link = await connectNecklace({ onAudio, onGone: () => void onGone() })
    link.onEvent(onEvent)
    set({ status: 'connected', name: link.name, speaker: (link.info.features & Feature.speaker) !== 0, fw: link.info.fw })
    await link.send(Op.volume, state.volume)
    await keepScreenOn()
    warmModels()
  } catch (e) {
    link = null
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

export function startSimulator() {
  set({ status: 'connected', name: 'Phone mic (simulator)', simulated: true, battery: 100, speaker: false })
  warmModels()
}

export function unpair() {
  replyToken++
  stopKeepAlive()
  link?.disconnect()
  link = null
  wakeLock?.release().catch(() => {})
  wakeLock = null
  set({ status: 'idle', name: undefined, simulated: false, battery: undefined, note: undefined })
}

// Simulator only: the phone's own mic stands in for the necklace.
export async function startListening() {
  if (!state.simulated) return
  chunks = []
  set({ status: 'listening', lastHeard: undefined, lastReply: undefined })
  sim = await recordMic()
  const tick = () => { if (sim) { set({ level: sim.level() }); raf = requestAnimationFrame(tick) } }
  tick()
}

export async function stopListening() {
  if (!state.simulated || state.status !== 'listening' || !sim) return
  cancelAnimationFrame(raf)
  set({ status: 'processing', level: 0 })
  const pcm = await sim.stop()
  sim = null
  try {
    const heard = pcm.length > 8000 ? await transcribe(pcm, (p) => set({ progress: p })) : ''
    set({ lastHeard: heard || '(didn’t catch that)', progress: undefined })
    if (heard) {
      const reply = await respond(heard)
      set({ lastReply: reply })
      say(reply, { expression: 'calm' })
    }
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) })
  }
  set({ status: 'connected' })
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
  let reply: string
  try {
    reply = llmReady() ? await llmReply(history, ctx) : ruleReply(text, ctx)
  } catch {
    reply = ruleReply(text, ctx) // on-device model hiccup: the rule reply never fails
  }
  await db.chat.add({ at: Date.now(), role: 'mirror', text: reply, source: llmReady() ? 'llm' : 'rules' })
  return reply
}

// ---------------------------------------------------------------- extras
export async function sendCalm(cycles = 4) {
  if (!link || state.simulated) return
  await link.send(Op.calm, Math.min(255, cycles)).catch(() => {})
}

export async function setNecklaceVolume(v: number) {
  const volume = Math.max(0, Math.min(100, Math.round(v)))
  set({ volume })
  writeLS('mm-necklace-volume', String(volume))
  await link?.send(Op.volume, volume).catch(() => {})
}

export function setNecklaceVoice(voice: NecklaceVoice) {
  set({ voice })
  writeLS('mm-necklace-voice', voice)
  if (link || state.simulated) warmModels()
}

/** Plays the phrase stored in the necklace: proves amp + speaker without the phone pipeline. */
export const testStoredPhrase = () => link?.send(Op.playLocal, LocalClip.test).catch(() => {})

/** Full downlink test: phone TTS -> BLE -> necklace speaker. */
export const testNecklaceVoice = () =>
  speakOnNecklace(getBuddy().character === 'roman' ? "Hi, I'm Roman. You're hearing me from your necklace." : "Hi, I'm Reenu. You're hearing me from your necklace.")
