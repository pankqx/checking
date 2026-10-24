// Audio helpers shared by the necklace link. The ADPCM and CRC-32 code must
// match firmware/mindmirror_necklace/adpcm.h and crc32.h byte for byte.

const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8]
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** IMA ADPCM decoder, low nibble first. 4:1 keeps 16 kHz speech at 64 kbit/s. */
export class AdpcmDecoder {
  pred = 0
  index = 0
  reset() { this.pred = 0; this.index = 0 }
  decode(bytes: Uint8Array): Float32Array {
    const out = new Float32Array(bytes.length * 2)
    let o = 0
    for (const b of bytes) {
      for (const nib of [b & 0x0f, b >> 4]) {
        const step = STEP[this.index]
        let diff = step >> 3
        if (nib & 4) diff += step
        if (nib & 2) diff += step >> 1
        if (nib & 1) diff += step >> 2
        this.pred = clamp(this.pred + (nib & 8 ? -diff : diff), -32768, 32767)
        this.index = clamp(this.index + IDX[nib & 7], 0, 88)
        out[o++] = this.pred / 32768
      }
    }
    return out
  }
}

/** IMA ADPCM encoder, low nibble first. An odd sample count is padded with one zero nibble. */
export function encodeAdpcm(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(pcm.length / 2))
  let pred = 0
  let index = 0
  for (let i = 0; i < pcm.length; i++) {
    let step = STEP[index]
    let diff = pcm[i] - pred
    let nib = 0
    if (diff < 0) { nib = 8; diff = -diff }
    let vp = step >> 3
    if (diff >= step) { nib |= 4; diff -= step; vp += step }
    step >>= 1
    if (diff >= step) { nib |= 2; diff -= step; vp += step }
    step >>= 1
    if (diff >= step) { nib |= 1; vp += step }
    pred = clamp(pred + (nib & 8 ? -vp : vp), -32768, 32767)
    index = clamp(index + IDX[nib & 7], 0, 88)
    if (i & 1) out[i >> 1] |= nib << 4
    else out[i >> 1] = nib
  }
  return out
}

let CRC_TABLE: Uint32Array | null = null
/** CRC-32 (IEEE, same as zlib). crc32("123456789") === 0xcbf43926. */
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[i] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Resample mono float audio to `dst` Hz: windowed-sinc low-pass, then linear interpolation. */
export function resample(x: Float32Array, src: number, dst = 16000): Float32Array {
  if (src === dst) return x
  let y = x
  if (dst < src) {
    const taps = 63
    const fc = (0.45 * dst) / src
    const h = new Float32Array(taps)
    let sum = 0
    for (let i = 0; i < taps; i++) {
      const n = i - (taps - 1) / 2
      const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n)
      h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)))
      sum += h[i]
    }
    y = new Float32Array(x.length)
    const half = (taps - 1) / 2
    for (let i = 0; i < x.length; i++) {
      let acc = 0
      for (let k = 0; k < taps; k++) {
        const j = i + k - half
        if (j >= 0 && j < x.length) acc += x[j] * h[k]
      }
      y[i] = acc / sum
    }
  }
  const n = Math.floor((x.length * dst) / src)
  const out = new Float32Array(n)
  const ratio = src / dst
  for (let i = 0; i < n; i++) {
    const t = i * ratio
    const j = Math.floor(t)
    const f = t - j
    out[i] = (y[j] ?? 0) * (1 - f) + (y[j + 1] ?? y[j] ?? 0) * f
  }
  return out
}

/** Float [-1, 1] to 16-bit with peak normalisation (to about -1 dBFS) and a soft limit. */
export function toInt16(x: Float32Array, target = 0.89): Int16Array {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  const g = peak > 1e-4 ? target / peak : 1
  const out = new Int16Array(x.length)
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * g
    const a = Math.abs(v)
    const y = a < 0.8 ? v : Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)) // soft knee, never clips
    out[i] = Math.round(y * 32767)
  }
  return out
}
