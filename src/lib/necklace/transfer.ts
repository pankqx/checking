// Reliable reply-clip transfer to the necklace: BEGIN, chunks, END, then wait
// for CLIP_OK. On CLIP_BAD the necklace names the first missing chunk and we
// resend from there (or everything after a CRC failure). The necklace never
// plays a clip it has not verified, so a failed transfer means silence plus a
// clear error, never garbled audio.

import { crc32, encodeAdpcm } from '../adpcm'
import { chunkFor, Op, packChunk, packClipBegin, packOp, type NecklaceEvent } from './protocol'

export interface Transport {
  writeCtrl: (bytes: Uint8Array) => Promise<void>
  writeData: (bytes: Uint8Array) => Promise<void>
  /** Resolve with the first event that matches, or null after `ms`. */
  waitFor: (match: (e: NecklaceEvent) => boolean, ms: number) => Promise<NecklaceEvent | null>
  mtu: () => number
}

export interface Clip { id: number; adpcm: Uint8Array; samples: number; last: boolean }

export function makeClip(id: number, pcm16k: Int16Array, last: boolean): Clip {
  return { id: id & 0xff, adpcm: encodeAdpcm(pcm16k), samples: pcm16k.length, last }
}

export class TransferError extends Error {}

export async function sendClip(t: Transport, clip: Clip, onProgress?: (sent: number, total: number) => void, retries = 2) {
  const chunk = chunkFor(t.mtu())
  const total = Math.ceil(clip.adpcm.length / chunk)
  const crc = crc32(clip.adpcm)
  const begin = packClipBegin({ clip: clip.id, last: clip.last, samples: clip.samples, bytes: clip.adpcm.length, crc, chunk })
  await t.writeCtrl(begin)
  let from = 0
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (let i = from; i < total; i++) {
      await t.writeData(packChunk(clip.id, i, clip.adpcm.subarray(i * chunk, Math.min((i + 1) * chunk, clip.adpcm.length))))
      if (i % 8 === 7) onProgress?.(i + 1, total)
    }
    onProgress?.(total, total)
    const answer = t.waitFor((e) => (e.type === 'clipOk' || e.type === 'clipBad') && e.clip === clip.id, 4000)
    await t.writeCtrl(packOp(Op.clipEnd, clip.id))
    const e = await answer
    if (e?.type === 'clipOk') return
    if (e?.type === 'clipBad') {
      if (e.reason === 'unknown') await t.writeCtrl(begin) // necklace lost the clip (e.g. timed out): start over
      from = e.reason === 'missing' ? e.firstMissing : 0
      continue
    }
    from = 0 // no answer: resend everything
    await t.writeCtrl(begin)
  }
  await t.writeCtrl(packOp(Op.clipAbort, clip.id)).catch(() => {})
  throw new TransferError(`Reply audio did not reach the necklace after ${retries + 1} tries`)
}
