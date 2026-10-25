// Soft sounds for the calm games, made with Web Audio so nothing is
// downloaded: chimes, water drops, a stone tock, raked sand and an ocean that
// swells at the pace of a slow breath. Everything starts only after a tap.

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66]
const PREF = 'mm-game-sound'

export const soundOn = () => { try { return localStorage.getItem(PREF) !== 'off' } catch { return true } }
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* private mode */ } }

export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }

export class Calm {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private oceanGain: GainNode | null = null
  private sandGain: GainNode | null = null
  muted = !soundOn()

  private ensure() {
    if (this.ctx) return this.ctx
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 1
      this.master.connect(this.ctx.destination)
    } catch { this.ctx = null }
    return this.ctx
  }

  setMuted(m: boolean) {
    this.muted = m
    setSoundOn(!m)
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.15)
  }

  private noise(seconds = 2, brown = true) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 } else d[i] = w
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    return src
  }

  /** A soft bell; `i` walks up a pentatonic scale. */
  chime(i = 0, gain = 0.16) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t = ctx.currentTime
    const f = PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length]
    for (const [mul, g, dur] of [[1, gain, 2.6], [2, gain * 0.25, 1.4], [3.01, gain * 0.08, 0.9]] as const) {
      const o = ctx.createOscillator()
      const e = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f * mul
      e.gain.setValueAtTime(0, t)
      e.gain.linearRampToValueAtTime(g, t + 0.012)
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(e).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  /** A water drop: a quick falling sine. */
  drop(gain = 0.12) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const e = ctx.createGain()
    const f = 700 + Math.random() * 500
    o.type = 'sine'
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.18)
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(gain, t + 0.008)
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(e).connect(this.master)
    o.start(t)
    o.stop(t + 0.4)
  }

  /** A stone set down on sand. */
  tock() {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const e = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(190, t)
    o.frequency.exponentialRampToValueAtTime(120, t + 0.15)
    e.gain.setValueAtTime(0, t)
    e.gain.linearRampToValueAtTime(0.22, t + 0.005)
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    o.connect(e).connect(this.master)
    o.start(t)
    o.stop(t + 0.45)
  }

  /** Ocean that swells every 10 s (4 in, 6 out). `level` 0..1 is how calm the sea is. */
  ocean(level: number) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    if (!this.oceanGain) {
      const src = this.noise(4)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 520
      const swell = ctx.createGain()
      swell.gain.value = 0
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.1
      const depth = ctx.createGain()
      depth.gain.value = 0.5
      const bias = ctx.createConstantSource()
      bias.offset.value = 0.55
      lfo.connect(depth).connect(swell.gain)
      bias.connect(swell.gain)
      this.oceanGain = ctx.createGain()
      this.oceanGain.gain.value = 0
      src.connect(lp).connect(swell).connect(this.oceanGain).connect(this.master)
      src.start()
      lfo.start()
      bias.start()
    }
    this.oceanGain.gain.setTargetAtTime(0.05 + level * 0.22, ctx.currentTime, 1.2)
  }

  /** Raked sand: soft noise that follows how fast the finger moves. */
  sand(speed: number) {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    if (!this.sandGain) {
      const src = this.noise(2, false)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2400
      bp.Q.value = 0.7
      this.sandGain = ctx.createGain()
      this.sandGain.gain.value = 0
      src.connect(bp).connect(this.sandGain).connect(this.master)
      src.start()
    }
    this.sandGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.00006), ctx.currentTime, 0.06)
  }

  close() {
    const ctx = this.ctx
    this.ctx = null
    if (!ctx || !this.master) return
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  }
}
