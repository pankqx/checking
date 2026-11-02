import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ruleReply } from '../lib/companion'
import { enableHub, hubEnabled, onTurn, playReply, saveTurn, setHubUrl, talkViaHub, useHub, type Turn } from '../lib/hub'
import { go } from '../lib/nav'
import { useData } from '../lib/useData'
import { moodFromText, speak, transcribe } from '../lib/voice'

// Voice mode: just talk. Hold the button here (phone or laptop mic) or the
// button on the necklace. With the laptop hub running, the hub listens and
// replies; without it, Whisper runs on this device and the rule-based
// companion answers. Every turn is saved as a check-in and a journal note.

type Phase = 'idle' | 'rec' | 'think'

const moodWord = (m: number) => (m >= 4 ? 'good' : m <= 1 ? 'low' : m === 2 ? 'stressed' : 'okay')

export default function Voice() {
  const d = useData()
  const hub = useHub()
  const [phase, setPhase] = useState<Phase>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [note, setNote] = useState('')
  const [level, setLevel] = useState(0)
  const [editing, setEditing] = useState(false)
  const rec = useRef<{ stop: () => Promise<Blob>; started: number } | null>(null)
  const online = hub.status === 'online' || hub.status === 'thinking'

  useEffect(() => onTurn((t) => { setTurns((ts) => [...ts.slice(-5), t]); setPhase('idle'); setNote('') }), [])

  // Space bar = hold to talk, for the laptop on stage.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); start() } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); stop() } }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  })

  const start = async () => {
    if (rec.current || phase === 'think') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let raf = 0
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let s = 0
        for (const v of buf) s += ((v - 128) / 128) ** 2
        setLevel(Math.min(1, Math.sqrt(s / buf.length) * 6))
        raf = requestAnimationFrame(tick)
      }
      tick()
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.start()
      setPhase('rec')
      setNote('')
      navigator.vibrate?.(15)
      rec.current = {
        started: Date.now(),
        stop: () => new Promise((resolve) => {
          mr.onstop = () => {
            cancelAnimationFrame(raf)
            stream.getTracks().forEach((t) => t.stop())
            ctx.close()
            setLevel(0)
            resolve(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))
          }
          mr.stop()
        }),
      }
    } catch {
      setNote('I can’t reach the microphone. Allow it in the browser, or use the necklace.')
    }
  }

  const stop = async () => {
    const r = rec.current
    if (!r) return
    rec.current = null
    const blob = await r.stop()
    if (Date.now() - r.started < 500) { setPhase('idle'); setNote('Hold a little longer while you speak.'); return }
    setPhase('think')
    try {
      if (online) {
        const mp3 = await talkViaHub(blob)
        playReply(URL.createObjectURL(mp3))
        return // the turn arrives from the hub's events and is saved there
      }
      setNote('Listening on this device…')
      const ctx = new AudioContext({ sampleRate: 16000 })
      const pcm = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0)
      ctx.close()
      const heard = await transcribe(pcm, (p) => setNote(`Getting the on-device listener ready… ${Math.round(p)}%`))
      const reply = heard ? ruleReply(heard, { name: d.profile?.name, insights: d.insights }) : 'I couldn’t hear that. Hold the button and try again?'
      const t: Turn = { at: Date.now(), source: 'web', heard, reply, mood: moodWord(moodFromText(heard)), signals: [] }
      setTurns((ts) => [...ts.slice(-5), t])
      speak(reply)
      await saveTurn(t, 'voice')
      setNote('')
    } catch {
      setNote('Something went wrong. Try once more?')
    }
    setPhase('idle')
  }

  const last = turns[turns.length - 1]
  const necklaceTalking = hub.status === 'thinking' && hub.thinking === 'necklace'
  const label = phase === 'rec' ? 'Listening…' : phase === 'think' || hub.status === 'thinking' ? (necklaceTalking ? 'Your necklace heard you. Thinking…' : 'Thinking…') : 'Hold to talk'

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.8 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      className="relative min-h-dvh overflow-hidden text-[#efeaf7]"
      style={{ background: 'radial-gradient(120% 70% at 50% 30%, #2c3570 0%, #161b3d 55%, #0b0f22 100%)' }}
    >
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(22px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <button onClick={() => go('home')} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Leave voice mode">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/60">Voice mode</p>
          <button
            onClick={() => enableHub(!hubEnabled() || hub.status === 'off' ? true : false)}
            className="flex items-center gap-2 rounded-full bg-white/10 py-2 pr-3.5 pl-3 text-xs font-semibold"
            aria-label="Necklace connection"
          >
            <span className={`size-2 rounded-full ${online ? 'bg-[#9fd3b4]' : hub.status === 'looking' ? 'animate-pulse bg-[#efcf7a]' : 'bg-white/30'}`} />
            {online ? 'Necklace on' : hub.status === 'looking' ? 'Looking…' : 'Necklace off'}
          </button>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center">
          <div className="relative grid size-64 place-items-center">
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(169,195,240,.38), rgba(174,163,212,.12) 55%, transparent 70%)' }}
              animate={{ scale: phase === 'rec' ? 1.05 + level * 0.35 : necklaceTalking || phase === 'think' ? [1, 1.12, 1] : [1, 1.08, 1] }}
              transition={phase === 'rec' ? { duration: 0.12 } : { duration: phase === 'think' || necklaceTalking ? 2.2 : 10, repeat: Infinity, ease: 'easeInOut', times: [0, 0.4, 1] }}
            />
            <motion.span
              className="relative size-40 rounded-full"
              style={{ background: 'radial-gradient(circle at 35% 28%, #ffffff 0%, #cfe0f7 18%, #a9c3f0 42%, #aea3d4 70%, #6d5fa8 100%)', boxShadow: '0 0 80px rgba(169,195,240,.45), inset -10px -16px 40px rgba(60,40,120,.35)' }}
              animate={{ scale: phase === 'rec' ? 1 + level * 0.12 : [1, 1.04, 1], rotate: phase === 'think' || necklaceTalking ? 360 : 0 }}
              transition={{ scale: phase === 'rec' ? { duration: 0.12 } : { duration: 10, repeat: Infinity, ease: 'easeInOut', times: [0, 0.4, 1] }, rotate: { duration: 6, repeat: Infinity, ease: 'linear' } }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={label} className="mt-6 max-w-xs text-center font-[Fraunces] text-2xl italic" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>{label}</motion.p>
          </AnimatePresence>
          {note && <p className="mt-2 text-center text-sm text-white/65">{note}</p>}

          <div className="mt-6 min-h-28 w-full">
            <AnimatePresence mode="wait">
              {last ? (
                <motion.div key={last.at} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="rounded-3xl bg-white/[.06] p-4 backdrop-blur-md">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{last.source === 'necklace' ? 'Your necklace heard' : 'You said'}</p>
                  <p className="mt-1 leading-snug">&ldquo;{last.heard}&rdquo;</p>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a9c3f0]">Mirror</p>
                  <p className="mt-1 leading-snug text-white/85">{last.reply}</p>
                  <p className="mt-3 text-xs text-white/45">Saved as a check-in and a journal note.</p>
                </motion.div>
              ) : (
                <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-xs text-center text-sm leading-relaxed text-white/60">
                  Say how your day is going, in your own words. {online ? 'Or hold the button on your necklace.' : 'Turn the necklace on above if your laptop hub is running.'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start() }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            disabled={phase === 'think'}
            className="relative grid size-20 touch-none select-none place-items-center rounded-full bg-[#efeaf7] text-[#1c2150] shadow-[0_10px_40px_-10px_rgba(169,195,240,.7)] transition active:scale-95 disabled:opacity-50"
            aria-label="Hold to talk"
          >
            {phase === 'rec' && <span className="absolute -inset-2 animate-ping rounded-full border-2 border-[#a9c3f0]/60" />}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></svg>
          </button>
          <p className="text-xs text-white/50">Hold to talk · on a laptop, hold the space bar</p>
          <button onClick={() => setEditing((x) => !x)} className="text-[11px] text-white/40 underline underline-offset-2">laptop hub: {hub.url}</button>
          {editing && (
            <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('hub'); if (v) setHubUrl(String(v)); setEditing(false) }}>
              <input name="hub" defaultValue={hub.url} className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none" aria-label="Hub address" />
              <button className="rounded-full bg-white/15 px-4 text-sm font-semibold">Save</button>
            </form>
          )}
        </div>
      </div>
    </motion.main>
  )
}
