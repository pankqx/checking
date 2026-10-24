// MindMirror Necklace BLE protocol, version 2. Spec: docs/NECKLACE_PROTOCOL.md.
// Mirrors firmware/mindmirror_necklace/protocol.h exactly.

export const PROTOCOL_VERSION = 2

export const UUID = {
  service: '6e400001-b5a3-f393-e0a9-e50e24dc4d4d',
  audioUp: '6e400002-b5a3-f393-e0a9-e50e24dc4d4d', // notify [sess u8][seq u16][ADPCM]
  ctrl: '6e400003-b5a3-f393-e0a9-e50e24dc4d4d', // write [op u8][args]
  state: '6e400004-b5a3-f393-e0a9-e50e24dc4d4d', // notify [event u8][args]
  audioDown: '6e400005-b5a3-f393-e0a9-e50e24dc4d4d', // write without response [clip u8][index u16][ADPCM]
}

export const AUDIO_RATE = 16000
export const MAX_CLIP_BYTES = 240000

export const Op = {
  hello: 0x01,
  thinking: 0x02,
  idle: 0x03,
  calm: 0x04,
  volume: 0x05,
  playLocal: 0x06,
  stop: 0x07,
  error: 0x08,
  clipBegin: 0x20,
  clipEnd: 0x21,
  clipAbort: 0x22,
} as const

export const Ev = {
  buttonDown: 0x10,
  recDone: 0x11,
  battery: 0x20,
  hello: 0x30,
  clipOk: 0x31,
  clipBad: 0x32,
  playStart: 0x33,
  playDone: 0x34,
  replyDone: 0x35,
  error: 0x40,
} as const

export const Feature = { speaker: 0x01, battery: 0x02, localClips: 0x04 }
export const CLIP_FLAG_LAST = 0x01

export const LocalClip = { hello: 0, noPhone: 1, retry: 2, test: 3, lowBattery: 4, onScreen: 5 } as const

export const ErrCode: Record<number, string> = {
  1: 'PSRAM is off in the firmware build',
  2: 'microphone did not start',
  3: 'speaker amplifier did not start',
  4: 'reply audio format was rejected',
  5: 'necklace reply queue is full',
  6: 'reply audio stopped arriving',
  7: 'necklace battery is low',
  8: 'phone did not answer in time',
}

export type NecklaceEvent =
  | { type: 'buttonDown'; session: number }
  | { type: 'recDone'; session: number; packets: number; bytes: number; timeLimit: boolean }
  | { type: 'battery'; pct: number; mv: number }
  | { type: 'hello'; protocol: number; mtu: number; features: number; volume: number; fw: string }
  | { type: 'clipOk'; clip: number }
  | { type: 'clipBad'; clip: number; firstMissing: number; reason: 'missing' | 'crc' | 'unknown' }
  | { type: 'playStart'; clip: number }
  | { type: 'playDone'; clip: number; interrupted: boolean }
  | { type: 'replyDone'; ok: boolean }
  | { type: 'error'; code: number; detail: number; message: string }
  | { type: 'unknown'; raw: number[] }

export function parseState(v: DataView): NecklaceEvent {
  const u8 = (i: number) => (i < v.byteLength ? v.getUint8(i) : 0)
  const u16 = (i: number) => (i + 1 < v.byteLength ? v.getUint16(i, true) : 0)
  const u32 = (i: number) => (i + 3 < v.byteLength ? v.getUint32(i, true) : 0)
  switch (u8(0)) {
    case Ev.buttonDown: return { type: 'buttonDown', session: u8(1) }
    case Ev.recDone: return { type: 'recDone', session: u8(1), packets: u16(2), bytes: u32(4), timeLimit: u8(8) === 1 }
    case Ev.battery: return { type: 'battery', pct: u8(1), mv: u16(2) }
    case Ev.hello: return { type: 'hello', protocol: u8(1), mtu: u16(2), features: u8(4), volume: u8(5), fw: `${u8(6)}.${u8(7)}` }
    case Ev.clipOk: return { type: 'clipOk', clip: u8(1) }
    case Ev.clipBad: return { type: 'clipBad', clip: u8(1), firstMissing: u16(2), reason: u8(4) === 1 ? 'missing' : u8(4) === 2 ? 'crc' : 'unknown' }
    case Ev.playStart: return { type: 'playStart', clip: u8(1) }
    case Ev.playDone: return { type: 'playDone', clip: u8(1), interrupted: u8(2) === 1 }
    case Ev.replyDone: return { type: 'replyDone', ok: u8(1) === 1 }
    case Ev.error: return { type: 'error', code: u8(1), detail: u8(2), message: ErrCode[u8(1)] ?? `error ${u8(1)}` }
    default: return { type: 'unknown', raw: Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  }
}

export interface AudioPacket { session: number; seq: number; adpcm: Uint8Array }
export function parseAudioUp(v: DataView): AudioPacket {
  return { session: v.getUint8(0), seq: v.getUint16(1, true), adpcm: new Uint8Array(v.buffer, v.byteOffset + 3, v.byteLength - 3) }
}

export interface ClipHeader { clip: number; last: boolean; samples: number; bytes: number; crc: number; chunk: number }

export function packClipBegin(h: ClipHeader): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b[0] = Op.clipBegin
  b[1] = h.clip & 0xff
  b[2] = h.last ? CLIP_FLAG_LAST : 0
  v.setUint16(3, AUDIO_RATE, true)
  v.setUint32(5, h.samples, true)
  v.setUint32(9, h.bytes, true)
  v.setUint32(13, h.crc >>> 0, true)
  v.setUint16(17, h.chunk, true)
  return b
}

export function packChunk(clip: number, index: number, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(3 + data.length)
  b[0] = clip & 0xff
  b[1] = index & 0xff
  b[2] = index >> 8
  b.set(data, 3)
  return b
}

export const packOp = (op: number, ...args: number[]) => Uint8Array.from([op, ...args.map((a) => a & 0xff)])

/** Payload bytes per AUDIO_DOWN write for a negotiated ATT MTU: MTU - 3 (ATT) - 3 (our header), capped so one write fits one 251-byte link-layer packet. */
export const chunkFor = (mtu: number) => Math.max(17, Math.min(mtu - 6, 241))
