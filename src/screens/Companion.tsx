import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Orb } from '../components/Orb'
import { isCrisis } from '../lib/analysis'
import { llmReady, llmReply, loadLLM, ruleReply, webgpuSupported } from '../lib/companion'
import { db } from '../lib/db'
import { go } from '../lib/nav'
import { useData } from '../lib/useData'
import { recordMic, speak, transcribe } from '../lib/voice'
import { MicIcon } from './CheckIn'

const STARTERS = ['What changed this week?', "I can't sleep", 'Too many deadlines', 'I feel kind of alone', 'Something good happened!']

export default function Companion() {
  const d = useData()
  const msgs = useLiveQuery(() => db.chat.orderBy('at').toArray(), []) ?? []
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [llm, setLlm] = useState<{ p: number; t: string } | null>(llmReady() ? { p: 1, t: 'ready' } : null)
  const [rec, setRec] = useState<Awaited<ReturnType<typeof recordMic>> | null>(null)
  const [talkBack, setTalkBack] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length, busy])

  const ctx = { name: d.profile?.name, insights: d.insights }
  const send = async (t: string) => {
    if (!t.trim()) return
    setText('')
    await db.chat.add({ at: Date.now(), role: 'me', text: t.trim() })
    setBusy(true)
    const history = [...msgs, { role: 'me' as const, text: t.trim(), at: Date.now() }]
    const reply = llmReady() ? await llmReply(history, ctx) : ruleReply(t, ctx)
    await new Promise((r) => setTimeout(r, llmReady() ? 0 : 450))
    await db.chat.add({ at: Date.now(), role: 'mirror', text: reply, source: llmReady() ? 'llm' : 'rules' })
    setBusy(false)
    if (talkBack) speak(reply)
  }

  const mic = async () => {
    if (!rec) {
      try { setRec(await recordMic()) } catch { alert('Microphone not available') }
      return
    }
    const r = rec
    setRec(null)
    setBusy(true)
    const pcm = await r.stop()
    const heard = await transcribe(pcm).catch(() => '')
    setBusy(false)
    if (heard) send(heard)
  }

  const enableLLM = async () => {
    setLlm({ p: 0, t: 'starting…' })
    try {
      await loadLLM((p, t) => setLlm({ p, t }))
      setLlm({ p: 1, t: 'ready' })
    } catch (e) {
      setLlm({ p: 0, t: `Couldn't load (${e instanceof Error ? e.message : 'error'}). Using built-in replies.` })
    }
  }

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-44 pt-6">
      <header className="flex items-center gap-3">
        <Orb mood={d.lastMood} size={56} />
        <div className="flex-1">
          <h1 className="display text-3xl leading-none">Mirror</h1>
          <p className="text-xs text-ink-faint">{llm?.p === 1 ? 'On-device AI (Qwen 2.5) · private' : 'Built-in companion · private · offline'}</p>
        </div>
        <button className={`chip text-xs ${talkBack ? '' : 'opacity-60'}`} aria-pressed={talkBack} onClick={() => setTalkBack(!talkBack)}>🔊 voice</button>
      </header>

      {!llm && webgpuSupported() && (
        <button onClick={enableLLM} className="card mt-4 p-4 text-left text-sm">
          <b>Make me smarter, privately.</b> <span className="text-ink-soft">Download a small AI model (~1 GB, once) that runs on your device. Your words never leave it.</span>
        </button>
      )}
      {llm && llm.p < 1 && (
        <div className="card mt-4 p-4 text-sm">
          <div className="h-2 overflow-hidden rounded-full bg-paper-2"><motion.div className="h-full bg-neel" animate={{ width: `${llm.p * 100}%` }} /></div>
          <p className="mt-2 line-clamp-2 text-xs text-ink-faint">{llm.t}</p>
        </div>
      )}

      <div className="mt-6 flex-1 space-y-3">
        {!msgs.length && (
          <div className="py-6 text-center">
            <p className="display-i text-2xl">Hey{d.profile?.name ? ` ${d.profile.name}` : ''}. What&rsquo;s on your mind?</p>
            <p className="mt-2 text-sm text-ink-faint">I&rsquo;m not a therapist and I won&rsquo;t diagnose. I&rsquo;m a mirror for your own patterns.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'me' ? 'justify-end' : ''}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-3 ${m.role === 'me' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-line bg-card'}`}>
                {m.text}
                {m.role === 'mirror' && isCrisis(msgs[msgs.indexOf(m) - 1]?.text ?? '') && (
                  <div className="mt-3 flex gap-2"><a className="btn bg-sindoor py-2 text-sm" href="tel:14416">Call 14416</a><a className="btn btn-ghost py-2 text-sm" href="tel:112">112</a></div>
                )}
                {m.source === 'necklace' && <span className="mt-1 block text-[10px] opacity-60">via pendant</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && <div className="flex gap-1 px-2">{[0, 1, 2].map((i) => <motion.span key={i} className="size-2 rounded-full bg-ink-faint" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />)}</div>}
        <div ref={end} />
      </div>

      <div className="fixed inset-x-0 bottom-24 z-40 px-4">
        <div className="mx-auto max-w-xl">
          <div className="snap-row -mx-4 pb-2">
            {STARTERS.map((s) => <button key={s} className="chip whitespace-nowrap text-sm" onClick={() => send(s)}>{s}</button>)}
            <button className="chip whitespace-nowrap text-sm" onClick={() => go('insights')}>Show my data →</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="flex items-center gap-2 rounded-full border border-line bg-card p-1.5 pl-5 shadow-[var(--shadow)]">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={rec ? 'Listening… tap mic to stop' : 'Say anything'} className="flex-1 bg-transparent outline-none" />
            <button type="button" onClick={mic} className={`grid size-10 place-items-center rounded-full ${rec ? 'animate-pulse bg-sindoor text-white' : 'bg-paper-2'}`} aria-label="Speak"><MicIcon /></button>
            <button className="grid size-10 place-items-center rounded-full bg-ink text-paper" aria-label="Send" disabled={busy}>↑</button>
          </form>
        </div>
      </div>
    </motion.main>
  )
}
