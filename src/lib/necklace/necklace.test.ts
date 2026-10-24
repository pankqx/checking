import { describe, expect, it } from 'vitest'
import { AdpcmDecoder, crc32, encodeAdpcm, resample, toInt16 } from '../adpcm'
import { chunkFor, Op, packClipBegin, parseState, type NecklaceEvent } from './protocol'
import { makeClip, sendClip, TransferError, type Transport } from './transfer'
import { splitSentences } from './voice'

// Same signal as firmware/test/golden.cpp
function goldenPcm() {
  const N = 4000
  const pcm = new Int16Array(N)
  let s = 1
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const tri = ((i * 37) % 2000) - 1000
    pcm[i] = tri * 13 + ((s >>> 16) & 0x3ff) - 512
  }
  return pcm
}

describe('ADPCM + CRC match the necklace firmware', () => {
  it('crc32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('encoder output and decoder output equal the C build (firmware/test/golden.cpp)', () => {
    const enc = encodeAdpcm(goldenPcm())
    expect(crc32(enc).toString(16)).toBe('9a23a3ee')
    const back = new AdpcmDecoder().decode(enc)
    const sum = back.reduce((a, v) => a + Math.round(v * 32768), 0)
    expect(sum).toBe(4000446)
  })
  it('speech-like audio survives the 4:1 round trip (SNR > 20 dB)', () => {
    const n = 16000
    const pcm = new Int16Array(n)
    for (let i = 0; i < n; i++) pcm[i] = Math.round(9000 * Math.sin((2 * Math.PI * 220 * i) / 16000) + 4000 * Math.sin((2 * Math.PI * 1300 * i) / 16000))
    const back = new AdpcmDecoder().decode(encodeAdpcm(pcm))
    let sig = 0, err = 0
    for (let i = 0; i < n; i++) { sig += pcm[i] ** 2; err += (pcm[i] - back[i] * 32768) ** 2 }
    expect(10 * Math.log10(sig / err)).toBeGreaterThan(20)
  })
})

describe('reply audio preparation', () => {
  it('resamples 44.1 kHz TTS to 16 kHz, keeping speech and cutting what the necklace cannot play', () => {
    const src = 44100
    const tone = (hz: number) => Float32Array.from({ length: src }, (_, i) => Math.sin((2 * Math.PI * hz * i) / src))
    const rms = (x: Float32Array) => Math.sqrt(x.slice(2000, -2000).reduce((a, v) => a + v * v, 0) / (x.length - 4000))
    const keep = resample(tone(1000), src)
    expect(keep.length).toBe(16000)
    expect(rms(keep)).toBeGreaterThan(0.65)
    expect(rms(resample(tone(12000), src))).toBeLessThan(0.05)
  })
  it('normalises to about -1 dBFS without clipping', () => {
    const out = toInt16(Float32Array.from([0, 0.1, -0.2, 0.05]))
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThan(32767)
    expect(Math.max(...Array.from(out, Math.abs))).toBeGreaterThan(25000)
  })
  it('splits replies into sentences, joining tiny ones', () => {
    expect(splitSentences('Hi. You slept 5.5 h, less than usual! Try winding down earlier tonight?')).toEqual(['Hi. You slept 5.5 h, less than usual!', 'Try winding down earlier tonight?'])
    const parts = splitSentences('Okay. That sounds heavy. Do you want to talk about it, or would a small distraction help more right now?')
    expect(parts[0]).toBe('Okay. That sounds heavy.')
    expect(parts).toHaveLength(2)
  })
})

describe('protocol', () => {
  it('packs CLIP_BEGIN exactly as protocol.h describes', () => {
    const b = packClipBegin({ clip: 7, last: true, samples: 48000, bytes: 24000, crc: 0xdeadbeef, chunk: 241 })
    const v = new DataView(b.buffer)
    expect(b.length).toBe(19)
    expect([b[0], b[1], b[2]]).toEqual([Op.clipBegin, 7, 1])
    expect(v.getUint16(3, true)).toBe(16000)
    expect(v.getUint32(5, true)).toBe(48000)
    expect(v.getUint32(9, true)).toBe(24000)
    expect(v.getUint32(13, true)).toBe(0xdeadbeef)
    expect(v.getUint16(17, true)).toBe(241)
  })
  it('parses HELLO and REC_DONE', () => {
    const hello = parseState(new DataView(Uint8Array.from([0x30, 2, 0x05, 0x02, 0x05, 70, 2, 0]).buffer))
    expect(hello).toEqual({ type: 'hello', protocol: 2, mtu: 517, features: 5, volume: 70, fw: '2.0' })
    const rec = parseState(new DataView(Uint8Array.from([0x11, 3, 50, 0, 0x40, 0x1f, 0, 0, 0]).buffer))
    expect(rec).toEqual({ type: 'recDone', session: 3, packets: 50, bytes: 8000, timeLimit: false })
  })
  it('sizes chunks from the MTU', () => {
    expect(chunkFor(23)).toBe(17)
    expect(chunkFor(185)).toBe(179)
    expect(chunkFor(517)).toBe(241)
  })
})

// A software necklace that follows the firmware's receive rules (clipBegin / clipData / clipEnd).
function fakeNecklace(opts: { dropOnce?: number[]; corruptOnce?: boolean; silent?: boolean } = {}) {
  const listeners = new Set<(e: NecklaceEvent) => void>()
  const emit = (e: NecklaceEvent) => { setTimeout(() => listeners.forEach((f) => f(e)), 0) }
  let clip: { id: number; bytes: number; crc: number; chunk: number; data: Uint8Array; have: Set<number>; n: number } | null = null
  const dropped = new Set(opts.dropOnce ?? [])
  let corrupt = opts.corruptOnce ?? false
  const played: Uint8Array[] = []
  const t: Transport = {
    mtu: () => 185,
    writeCtrl: async (b) => {
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
      if (b[0] === Op.clipBegin) {
        const bytes = v.getUint32(9, true), chunk = v.getUint16(17, true)
        clip = { id: b[1], bytes, crc: v.getUint32(13, true), chunk, data: new Uint8Array(bytes), have: new Set(), n: Math.ceil(bytes / chunk) }
      }
      if (b[0] === Op.clipEnd && !opts.silent) {
        if (!clip || clip.id !== b[1]) return emit({ type: 'clipBad', clip: b[1], firstMissing: 0, reason: 'unknown' })
        let miss = 0
        while (miss < clip.n && clip.have.has(miss)) miss++
        if (miss < clip.n) return emit({ type: 'clipBad', clip: clip.id, firstMissing: miss, reason: 'missing' })
        if (crc32(clip.data) !== clip.crc) { clip.have.clear(); return emit({ type: 'clipBad', clip: clip.id, firstMissing: 0, reason: 'crc' }) }
        played.push(clip.data)
        emit({ type: 'clipOk', clip: clip.id })
      }
    },
    writeData: async (b) => {
      if (!clip || b[0] !== clip.id) return
      const idx = b[1] | (b[2] << 8)
      if (dropped.delete(idx)) return
      const payload = b.slice(3)
      if (corrupt && idx === 1) { payload[0] ^= 0xff; corrupt = false }
      clip.data.set(payload, idx * clip.chunk)
      clip.have.add(idx)
    },
    waitFor: (match, ms) => new Promise((resolve) => {
      const fn = (e: NecklaceEvent) => { if (match(e)) { listeners.delete(fn); clearTimeout(timer); resolve(e) } }
      const timer = setTimeout(() => { listeners.delete(fn); resolve(null) }, ms)
      listeners.add(fn)
    }),
  }
  return { t, played }
}

describe('reply clip transfer', () => {
  const pcm = Int16Array.from({ length: 16000 }, (_, i) => Math.round(8000 * Math.sin(i / 7)))

  it('delivers a clip the necklace can verify', async () => {
    const n = fakeNecklace()
    const clip = makeClip(1, pcm, true)
    await sendClip(n.t, clip)
    expect(n.played).toHaveLength(1)
    expect(crc32(n.played[0])).toBe(crc32(clip.adpcm))
  })
  it('resends from the first missing chunk', async () => {
    const n = fakeNecklace({ dropOnce: [3, 20] })
    await sendClip(n.t, makeClip(2, pcm, true))
    expect(n.played).toHaveLength(1)
  })
  it('resends everything after a CRC failure, so corrupted audio is never played', async () => {
    const n = fakeNecklace({ corruptOnce: true })
    const clip = makeClip(3, pcm, true)
    await sendClip(n.t, clip)
    expect(n.played).toHaveLength(1)
    expect(crc32(n.played[0])).toBe(crc32(clip.adpcm))
  })
  it('gives up with a clear error when the necklace never confirms', async () => {
    const n = fakeNecklace({ silent: true })
    await expect(sendClip(n.t, makeClip(4, pcm.slice(0, 800), true), undefined, 0)).rejects.toBeInstanceOf(TransferError)
    expect(n.played).toHaveLength(0)
  }, 10000)
})
