// Generative soundscapes with Web Audio: no audio files to download.

export type Scape = 'rain' | 'ocean' | 'tanpura' | 'silence'

let ctx: AudioContext | null = null
let stopFns: (() => void)[] = []

const ac = () => (ctx ??= new AudioContext())

function noise(a: AudioContext, kind: 'brown' | 'pink') {
  const len = a.sampleRate * 4
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0, b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 }
    else { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.4 }
  }
  const src = a.createBufferSource()
  src.buffer = buf
  src.loop = true
  return src
}

export function stopScape() {
  stopFns.forEach((f) => f())
  stopFns = []
}

export function playScape(s: Scape, volume = 0.5) {
  stopScape()
  if (s === 'silence') return
  const a = ac()
  a.resume()
  const master = a.createGain()
  master.gain.setValueAtTime(0, a.currentTime)
  master.gain.linearRampToValueAtTime(volume, a.currentTime + 2)
  master.connect(a.destination)
  const nodes: AudioScheduledSourceNode[] = []

  if (s === 'rain') {
    const n = noise(a, 'pink')
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900
    n.connect(f).connect(master); nodes.push(n)
  }
  if (s === 'ocean') {
    const n = noise(a, 'brown')
    const g = a.createGain(); g.gain.value = 0.5
    const lfo = a.createOscillator(); lfo.frequency.value = 0.09
    const lg = a.createGain(); lg.gain.value = 0.45
    lfo.connect(lg).connect(g.gain)
    n.connect(g).connect(master); nodes.push(n, lfo)
  }
  if (s === 'tanpura') {
    // Sa–Pa–Sa–Sa drone with slow beating, the classic practice drone.
    const base = 130.81
    for (const [mult, gain] of [[1, 0.22], [1.5, 0.16], [2, 0.14], [0.5, 0.18]] as const) {
      const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base * mult
      o.detune.value = Math.random() * 6 - 3
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7
      const g = a.createGain(); g.gain.value = gain * 0.35
      const l = a.createOscillator(); l.frequency.value = 0.15 + Math.random() * 0.2
      const lg = a.createGain(); lg.gain.value = gain * 0.15
      l.connect(lg).connect(g.gain)
      o.connect(lp).connect(g).connect(master); nodes.push(o, l)
    }
  }
  nodes.forEach((n) => n.start())
  stopFns.push(() => {
    master.gain.cancelScheduledValues(a.currentTime)
    master.gain.setValueAtTime(master.gain.value, a.currentTime)
    master.gain.linearRampToValueAtTime(0, a.currentTime + 0.8)
    setTimeout(() => nodes.forEach((n) => n.stop()), 900)
  })
}

export function chime(freq = 528) {
  const a = ac()
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 2.5)
  o.connect(g).connect(a.destination)
  o.start(); o.stop(a.currentTime + 2.6)
}

export function pop() {
  const a = ac()
  const o = a.createOscillator(); o.type = 'triangle'
  o.frequency.setValueAtTime(700 + Math.random() * 400, a.currentTime)
  o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.08)
  const g = a.createGain()
  g.gain.setValueAtTime(0.35, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.1)
  o.connect(g).connect(a.destination)
  o.start(); o.stop(a.currentTime + 0.12)
}
