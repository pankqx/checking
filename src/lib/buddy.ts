import { useSyncExternalStore } from 'react'
import { characters, type CharacterId, type CharState, type Expression } from '../character/characters'

// The companion's shared state: who it is, what it's saying, its face, and
// the look of the whole app (minimal paper vs. full grandeur night garden).
// Lip-sync: speechSynthesis word boundaries push the mouth open; the
// character's rAF loop eases it closed again.

export type UiMode = 'minimal' | 'grandeur'

interface State {
  character: CharacterId
  ui: UiMode
  voice: boolean
  state: CharState
  expression: Expression
  line: string
  /** index of the word being spoken, for karaoke captions */
  word: number
}

const read = <T extends string>(k: string, fallback: T): T => { try { return (localStorage.getItem(k) as T) ?? fallback } catch { return fallback } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

let state: State = {
  character: read<CharacterId>('mm-character', 'reenu'),
  ui: read<UiMode>('mm-ui', 'minimal'),
  voice: read('mm-voice', 'on') === 'on',
  state: 'IDLE',
  expression: 'neutral',
  line: '',
  word: -1,
}
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
export const getBuddy = () => state
export const useBuddy = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)

/** Mouth openness the character reads every frame (0..1). */
export const mouth = { target: 0, boundaryAt: 0 }

export function applyUi(ui: UiMode = state.ui) {
  document.documentElement.dataset.ui = ui
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', ui === 'grandeur' ? '#07060d' : '#F3EEE4')
}
export function setUi(ui: UiMode) { write('mm-ui', ui); set({ ui }); applyUi(ui) }
export function setCharacter(character: CharacterId) { write('mm-character', character); set({ character }) }
export function setVoice(voice: boolean) { write('mm-voice', voice ? 'on' : 'off'); set({ voice }); if (!voice) speechSynthesis?.cancel() }
export function setFace(expression: Expression, s?: CharState) { set({ expression, ...(s ? { state: s } : {}) }) }
export function setCharState(s: CharState) { set({ state: s }) }

let timer = 0
let seq = 0

/** Make the companion say something: caption always, voice if enabled. */
export function say(text: string, opts: { expression?: Expression; greet?: boolean; voice?: boolean } = {}) {
  const my = ++seq
  clearTimeout(timer)
  const words = text.split(/\s+/).filter(Boolean)
  set({ line: text, word: 0, state: opts.greet ? 'GREETING' : 'SPEAKING', expression: opts.expression ?? state.expression })
  const done = () => {
    if (my !== seq) return
    mouth.target = 0
    set({ state: 'IDLE', word: words.length })
  }
  const wantVoice = (opts.voice ?? state.voice) && typeof window !== 'undefined' && 'speechSynthesis' in window
  if (!wantVoice) return fakeSpeak(words, my, done)

  const cfg = characters[state.character]
  const u = new SpeechSynthesisUtterance(text)
  u.lang = cfg.voice.lang
  u.pitch = cfg.voice.pitch
  u.rate = cfg.voice.rate
  const voices = speechSynthesis.getVoices()
  const v = cfg.voice.preferNames.map((n) => voices.find((x) => x.name.includes(n))).find(Boolean) ?? voices.find((x) => x.lang === cfg.voice.lang) ?? voices.find((x) => x.lang.startsWith('en'))
  if (v) u.voice = v
  let gotBoundary = false
  u.onboundary = (e) => {
    if (my !== seq || e.name !== 'word') return
    gotBoundary = true
    mouth.target = 1
    mouth.boundaryAt = performance.now()
    const idx = text.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length
    set({ word: idx })
  }
  u.onstart = () => {
    // Some voices never fire boundaries: fall back to estimated word timing.
    setTimeout(() => { if (!gotBoundary && my === seq) fakeSpeak(words, my, () => {}, true) }, 600)
  }
  u.onend = done
  u.onerror = () => fakeSpeak(words, my, done)
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  // safety net if onend never arrives
  timer = window.setTimeout(done, Math.max(2500, words.length * 520))
}

function fakeSpeak(words: string[], my: number, done: () => void, keepAlive = false) {
  let i = 0
  const step = () => {
    if (my !== seq) return
    if (i >= words.length) { if (!keepAlive) done(); return }
    mouth.target = 1
    mouth.boundaryAt = performance.now()
    set({ word: i })
    const ms = 110 + words[i].length * 55
    i++
    window.setTimeout(step, ms)
  }
  step()
}

export function hush() {
  seq++
  mouth.target = 0
  try { speechSynthesis.cancel() } catch { /* unsupported */ }
  set({ state: 'IDLE' })
}

/** Show a line as already said (no voice, no mouth), e.g. on revisits. */
export function show(text: string, expression?: Expression) {
  set({ line: text, word: text.split(/\s+/).length, state: 'IDLE', ...(expression ? { expression } : {}) })
}

/** Speak a line once per session per key; afterwards just show it. */
export function sayOnce(key: string, text: string, opts: Parameters<typeof say>[1] = {}) {
  let seen = false
  try { seen = sessionStorage.getItem(`mm-said-${key}`) === '1'; sessionStorage.setItem(`mm-said-${key}`, '1') } catch { /* ignore */ }
  if (seen) show(text, opts.expression)
  else say(text, opts)
}
