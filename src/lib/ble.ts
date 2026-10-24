// Bluetooth helpers. Web Bluetooth works in Chrome/Edge on Android, Windows,
// macOS and ChromeOS. iOS Safari does not support it (use the Bluefy browser
// or the import option instead).

import { Op, packOp, parseAudioUp, parseState, UUID, type AudioPacket, type NecklaceEvent } from './necklace/protocol'
import type { Transport } from './necklace/transfer'

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
/* MindMirror Necklace v2: see docs/NECKLACE_PROTOCOL.md               */
/* ------------------------------------------------------------------ */

export { AdpcmDecoder } from './adpcm'


export interface NecklaceInfo { protocol: number; mtu: number; features: number; volume: number; fw: string }

export interface NecklaceLink {
  name: string
  info: NecklaceInfo
  transport: Transport
  send: (op: number, ...args: number[]) => Promise<void>
  onEvent: (fn: (e: NecklaceEvent) => void) => () => void
  reconnect: () => Promise<void>
  disconnect: () => void
}

export async function connectNecklace(handlers: { onAudio: (p: AudioPacket) => void; onGone: () => void }): Promise<NecklaceLink> {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [UUID.service] }, { namePrefix: 'MindMirror' }], optionalServices: [UUID.service] })
  let ctrl!: BluetoothRemoteGATTCharacteristic
  let down!: BluetoothRemoteGATTCharacteristic
  let intentional = false
  const listeners = new Set<(e: NecklaceEvent) => void>()
  const info: NecklaceInfo = { protocol: 0, mtu: 23, features: 0, volume: 70, fw: '?' }

  // Chrome allows one GATT operation at a time, so every write goes through this queue.
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T,>(f: () => Promise<T>): Promise<T> => {
    const next = chain.then(f, f)
    chain = next.catch(() => {})
    return next
  }

  const onState = (ev: Event) => {
    const e = parseState((ev.target as BluetoothRemoteGATTCharacteristic).value!)
    if (e.type === 'hello') Object.assign(info, { protocol: e.protocol, mtu: e.mtu, features: e.features, volume: e.volume, fw: e.fw })
    listeners.forEach((f) => f(e))
  }
  const onAudio = (ev: Event) => handlers.onAudio(parseAudioUp((ev.target as BluetoothRemoteGATTCharacteristic).value!))

  const waitFor: Transport['waitFor'] = (match, ms) =>
    new Promise((resolve) => {
      const off = () => { listeners.delete(fn); clearTimeout(timer) }
      const fn = (e: NecklaceEvent) => { if (match(e)) { off(); resolve(e) } }
      const timer = setTimeout(() => { off(); resolve(null) }, ms)
      listeners.add(fn)
    })

  const setup = async () => {
    const server = await device.gatt!.connect()
    const svc = await server.getPrimaryService(UUID.service)
    const [audio, c, state] = await Promise.all([svc.getCharacteristic(UUID.audioUp), svc.getCharacteristic(UUID.ctrl), svc.getCharacteristic(UUID.state)])
    down = await svc.getCharacteristic(UUID.audioDown).catch(() => {
      throw new Error('This necklace runs old firmware without a speaker. Flash mindmirror_necklace.ino and pair again.')
    })
    ctrl = c
    audio.removeEventListener('characteristicvaluechanged', onAudio)
    state.removeEventListener('characteristicvaluechanged', onState)
    audio.addEventListener('characteristicvaluechanged', onAudio)
    state.addEventListener('characteristicvaluechanged', onState)
    await audio.startNotifications()
    await state.startNotifications()
    const hello = waitFor((e) => e.type === 'hello', 2500)
    await serial(() => ctrl.writeValueWithResponse(packOp(Op.hello)))
    if (!(await hello)) throw new Error('The necklace did not answer. Switch it off and on, then pair again.')
  }

  device.addEventListener('gattserverdisconnected', () => { if (!intentional) handlers.onGone() })
  await setup()

  return {
    name: device.name ?? 'MindMirror necklace',
    info,
    transport: {
      writeCtrl: (b) => serial(() => ctrl.writeValueWithResponse(b as BufferSource)),
      writeData: (b) => serial(() => down.writeValueWithoutResponse(b as BufferSource)),
      waitFor,
      mtu: () => info.mtu,
    },
    send: (op, ...args) => serial(() => ctrl.writeValueWithResponse(packOp(op, ...args))),
    onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    reconnect: setup,
    disconnect: () => { intentional = true; device.gatt?.disconnect() },
  }
}
