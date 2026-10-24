// Text-to-speech that produces audio DATA (not phone-speaker playback), so the
// reply can be sent to the necklace and played on its own speaker. Runs on
// the phone with Transformers.js; nothing goes to a server.
//
//   quick   Xenova/mms-tts-eng (VITS), 38 MB, 16 kHz native, works everywhere
//   natural onnx-community/Supertonic-TTS-ONNX, 263 MB, 44.1 kHz, Reenu = F1, Roman = M1

import { resample, toInt16 } from '../adpcm'

export type NecklaceVoice = 'quick' | 'natural'
interface RawAudio { audio: Float32Array; sampling_rate: number }
type Tts = (text: string, opts?: Record<string, unknown>) => Promise<RawAudio>

const MODELS: Record<NecklaceVoice, string> = { quick: 'Xenova/mms-tts-eng', natural: 'onnx-community/Supertonic-TTS-ONNX' }
const SUPERTONIC_VOICES = 'https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/'

const cache = new Map<NecklaceVoice, Promise<Tts>>()

export function loadVoice(voice: NecklaceVoice, onProgress?: (pct: number) => void): Promise<Tts> {
  let p = cache.get(voice)
  if (!p) {
    p = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator
      const opts: Record<string, unknown> = {
        progress_callback: (e: unknown) => {
          const x = e as { progress?: number }
          if (x.progress != null) onProgress?.(x.progress)
        },
      }
      if (voice === 'quick') opts.dtype = 'q8'
      else if (webgpu) opts.device = 'webgpu'
      const tts = await pipeline('text-to-speech', MODELS[voice], opts)
      return tts as unknown as Tts
    })()
    p.catch(() => cache.delete(voice))
    cache.set(voice, p)
  }
  return p
}

/** Split a reply into sentence-sized pieces so the first one can play while the next is made. */
export function splitSentences(text: string, max = 220): string[] {
  // Split after . ! ? followed by a space, so "5.5 h" stays whole.
  const parts = text
    .replace(/\s*[•\n]+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?]["')\]]*)\s+/)
  const out: string[] = []
  for (const raw of parts.map((s) => s.trim()).filter(Boolean)) {
    const last = out[out.length - 1]
    if (last && last.length + raw.length < 60) out[out.length - 1] = `${last} ${raw}` // join very short bits
    else if (raw.length <= max) out.push(raw)
    else for (const piece of raw.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? [raw]) out.push(piece.trim())
  }
  return out
}

/** Speech for one sentence as 16 kHz 16-bit mono, ready for ADPCM. */
export async function synthesize(text: string, voice: NecklaceVoice, character: 'reenu' | 'roman', onProgress?: (pct: number) => void): Promise<Int16Array> {
  const tts = await loadVoice(voice, onProgress)
  const out = voice === 'natural'
    ? await tts(text, { speaker_embeddings: `${SUPERTONIC_VOICES}${character === 'roman' ? 'M1' : 'F1'}.bin`, num_inference_steps: 5, speed: 1.05 })
    : await tts(text)
  return toInt16(resample(out.audio, out.sampling_rate, 16000))
}

export const voiceSizes: Record<NecklaceVoice, string> = { quick: '38 MB', natural: '263 MB' }
