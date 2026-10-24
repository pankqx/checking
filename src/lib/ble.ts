// Bluetooth helpers. Web Bluetooth works in Chrome/Edge on Android, Windows,
// macOS and ChromeOS. iOS Safari does not support it (use the Bluefy browser
// or the import option instead).

export const bleSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator

/* ------------------------------------------------------------------ */
/* Smartwatch / HR strap: standard GATT Heart Rate service 0x180D.     */
/* Works with chest straps, Polar/Garmin/Amazfit "broadcast HR" modes. */
/* ------------------------------------------------------------------ */

export interface HrReading { bpm: number; rr: number[]; at: number }

export function parseHeartRate(v: DataView): HrReading {
  const flags = v.getUint8(0)
  const wide = flags & 0x01
  let i = 1
  const bpm = wide ? v.getUint16(i, true) : v.getUint8(i)
  i += wide ? 2 : 1
  if (flags & 0x08) i += 2 // energy expended
  const rr: number[] = []
  if (flags & 0x10) for (; i + 1 < v.byteLength; i += 2) rr.push((v.getUint16(i, true) / 1024) * 1000)
  return { bpm, rr, at: Date.now() }
}

export async function connectHeartRate(onReading: (r: HrReading) => void, onGone: () => void) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] })
  device.addEventListener('gattserverdisconnected', onGone)
  const server = await device.gatt!.connect()
  const svc = await server.getPrimaryService('heart_rate')
  const ch = await svc.getCharacteristic('heart_rate_measurement')
  ch.addEventListener('characteristicvaluechanged', (e) => onReading(parseHeartRate((e.target as BluetoothRemoteGATTCharacteristic).value!)))
  await ch.startNotifications()
  return { name: device.name ?? 'Heart-rate device', disconnect: () => device.gatt?.disconnect() }
}

/** RMSSD from RR intervals, a common short-term HRV measure (ms). */
export function rmssd(rr: number[]) {
  if (rr.length < 3) return NaN
  let s = 0
  for (let i = 1; i < rr.length; i++) s += (rr[i] - rr[i - 1]) ** 2
  return Math.sqrt(s / (rr.length - 1))
}

/* ------------------------------------------------------------------ */
/* MindMirror Pendant (ESP32-S3) custom GATT protocol                  */
/* ------------------------------------------------------------------ */

export const PENDANT = {
  service: '6e400001-b5a3-f393-e0a9-e50e24dc4d4d',
  audio: '6e400002-b5a3-f393-e0a9-e50e24dc4d4d', // notify: [seq u16][IMA-ADPCM 4-bit, 16 kHz mono]
  control: '6e400003-b5a3-f393-e0a9-e50e24dc4d4d', // write: commands to pendant
  state: '6e400004-b5a3-f393-e0a9-e50e24dc4d4d', // notify: button / battery events
}

export const PendantCmd = {
  listening: 0x01, // LED breathes indigo
  thinking: 0x02, // LED swirls
  reply: 0x03, // + up to 180 bytes of UTF-8: haptic tap, optional speaker TTS on v2
  idle: 0x04,
  calm: 0x05, // 4-7-8 breathing light + haptics for N cycles (next byte)
}

/* IMA ADPCM decoder: 4:1 compression keeps 16 kHz speech at 64 kbps,
   well within BLE 2M PHY throughput even on cheap phones. */
const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8]

export class AdpcmDecoder {
  pred = 0
  index = 0
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
        this.pred += nib & 8 ? -diff : diff
        this.pred = Math.max(-32768, Math.min(32767, this.pred))
        this.index = Math.max(0, Math.min(88, this.index + IDX[nib & 7]))
        out[o++] = this.pred / 32768
      }
    }
    return out
  }
}

export interface PendantLink {
  name: string
  send: (cmd: number, text?: string) => Promise<void>
  disconnect: () => void
}

export async function connectPendant(handlers: {
  onAudio: (pcm: Float32Array) => void
  onButton: (pressed: boolean) => void
  onBattery: (pct: number) => void
  onGone: () => void
}): Promise<PendantLink> {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [PENDANT.service] }, { namePrefix: 'MindMirror' }], optionalServices: [PENDANT.service] })
  device.addEventListener('gattserverdisconnected', handlers.onGone)
  const server = await device.gatt!.connect()
  const svc = await server.getPrimaryService(PENDANT.service)
  const [audio, control, state] = await Promise.all([svc.getCharacteristic(PENDANT.audio), svc.getCharacteristic(PENDANT.control), svc.getCharacteristic(PENDANT.state)])
  const dec = new AdpcmDecoder()
  audio.addEventListener('characteristicvaluechanged', (e) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value!
    handlers.onAudio(dec.decode(new Uint8Array(v.buffer, v.byteOffset + 2, v.byteLength - 2)))
  })
  state.addEventListener('characteristicvaluechanged', (e) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value!
    const kind = v.getUint8(0)
    if (kind === 0x10) {
      handlers.onButton(v.getUint8(1) === 1)
      if (v.getUint8(1) === 1) { dec.pred = 0; dec.index = 0 }
    }
    if (kind === 0x20) handlers.onBattery(v.getUint8(1))
  })
  await audio.startNotifications()
  await state.startNotifications()
  return {
    name: device.name ?? 'MindMirror Pendant',
    send: async (cmd, text) => {
      const body = text ? new TextEncoder().encode(text).slice(0, 180) : new Uint8Array()
      const pkt = new Uint8Array(1 + body.length)
      pkt[0] = cmd
      pkt.set(body, 1)
      await control.writeValueWithoutResponse(pkt)
    },
    disconnect: () => device.gatt?.disconnect(),
  }
}
