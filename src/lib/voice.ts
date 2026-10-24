// On-device speech-to-text with Whisper (Transformers.js). Audio never leaves
// the browser. The model (~40 MB, whisper-tiny.en) downloads once and is cached.

type Asr = (audio: Float32Array) => Promise<{ text: string }>
let asr: Asr | null = null
let loading: Promise<Asr> | null = null

export async function loadWhisper(onProgress?: (pct: number) => void): Promise<Asr> {
  if (asr) return asr
  loading ??= (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    const p = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (e: unknown) => {
        const x = e as { progress?: number }
        if (x.progress != null) onProgress?.(x.progress)
      },
    })
    asr = p as unknown as Asr
    return asr
  })()
  return loading
}

export async function transcribe(pcm16k: Float32Array, onProgress?: (pct: number) => void) {
  const run = await loadWhisper(onProgress)
  const out = await run(pcm16k)
  return out.text.trim()
}

/** Record from the mic and return 16 kHz mono PCM. */
export async function recordMic(): Promise<{ stop: () => Promise<Float32Array>; level: () => number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  src.connect(analyser)
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => chunks.push(e.data)
  rec.start()
  const buf = new Uint8Array(analyser.fftSize)
  return {
    level: () => {
      analyser.getByteTimeDomainData(buf)
      let s = 0
      for (const v of buf) s += ((v - 128) / 128) ** 2
      return Math.sqrt(s / buf.length)
    },
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          const ab = await new Blob(chunks).arrayBuffer()
          const decoded = await ctx.decodeAudioData(ab)
          resolve(decoded.getChannelData(0))
          ctx.close()
        }
        rec.stop()
      }),
  }
}

/** Simple lexicon mood guess from a transcript (1..5). Code, not AI. */
export function moodFromText(t: string) {
  const s = t.toLowerCase()
  const pos = ['good', 'great', 'happy', 'calm', 'fine', 'excited', 'relaxed', 'okay', 'proud', 'better', 'awesome']
  const neg = ['bad', 'sad', 'tired', 'stressed', 'anxious', 'awful', 'angry', 'lonely', 'exhausted', 'worried', 'overwhelmed', 'low']
  let score = 0
  for (const w of pos) if (s.includes(w)) score++
  for (const w of neg) if (s.includes(w)) score--
  if (/not (good|great|happy|fine|okay)/.test(s)) score -= 2
  return Math.max(1, Math.min(5, 3 + score))
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.98
  u.pitch = 1.05
  const v = speechSynthesis.getVoices().find((v) => /en-IN/i.test(v.lang)) ?? speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang))
  if (v) u.voice = v
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}
