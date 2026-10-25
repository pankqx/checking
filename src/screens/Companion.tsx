import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Buddy, Caption } from '../components/Buddy'
import { usePageMotion } from '../components/fx'
import { characters } from '../character/characters'
import { isCrisis } from '../lib/analysis'
import { llmReady, llmReply, loadLLM, ruleReply, webgpuSupported } from '../lib/companion'
import { getBuddy, hush, say, setCharState, useBuddy } from '../lib/buddy'
import { db } from '../lib/db'
import { go } from '../lib/nav'
import { useData } from '../lib/useData'
import { recordMic, transcribe } from '../lib/voice'
import { MicIcon } from './CheckIn'

const STARTERS = ['What changed this week?', "I can't sleep", 'Too many deadlines', 'I feel kind of alone', 'Something good happened!']

export default function Companion() {
  const d = useData()
  const msgs = useLiveQuery(() => db.chat.orderBy('at').toArray(), []) ?? []
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [llm, setLlm] = useState<{ p: number; t: string } | null>(llmReady() ? { p: 1, t: 'ready' } : null)
  const [rec, setRec] = useState<Awaited<ReturnType<typeof recordMic>> | null>(null)
  const b = useBuddy()
  const pm = usePageMotion()
  const cfg = characters[b.character]
  useEffect(() => () => hush(), [])
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
    setCharState('THINKING')
    const history = [...msgs, { role: 'me' as const, text: t.trim(), at: Date.now() }]
    const reply = llmReady() ? await llmReply(history, ctx) : ruleReply(t, ctx)
    await new Promise((r) => setTimeout(r, llmReady() ? 0 : 450))
    await db.chat.add({ at: Date.now(), role: 'mirror', text: reply, source: llmReady() ? 'llm' : 'rules' })
    setBusy(false)
    say(reply, { expression: isCrisis(t) ? 'concerned' : /love|great|proud|good|happy|yay|brighter/i.test(reply) ? 'happy' : /heavy|sorry|alone|hard|rough/i.test(reply) ? 'concerned' : 'neutral' })
  }

  const mic = async () => {
    if (!rec) {
      try { setRec(await recordMic()); setCharState('LISTENING') } catch { alert('Microphone not available') }
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
    <motion.main {...pm} className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-44 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="display text-3xl leading-none">{cfg.name}</h1>
          <p className="text-xs text-ink-faint">{llm?.p === 1 ? 'On-device AI (Qwen 2.5) · private' : 'Built-in companion · private · offline'} · {b.state.toLowerCase()}</p>
        </div>
        <div className="flex gap-2">
          {!llm && webgpuSupported() && <button className="chip text-xs" onClick={enableLLM} title="Download a small AI model (~1 GB, once) that runs on your device. Your words never leave it.">⚡ smarter AI</button>}
          <button className="chip text-xs" onClick={() => go('you')}>switch</button>
        </div>
      </header>
      <section className="relative mt-2 flex flex-col items-center">
        {b.ui === 'grandeur' && <div className="absolute top-10 -z-10 size-72 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(167,139,250,.45), transparent)' }} />}
        <Buddy height={b.ui === 'grandeur' ? 380 : 300} />
        <div className="-mt-4 w-full"><Caption fallback={`Hey${d.profile?.name ? ` ${d.profile.name}` : ''}. What’s on your mind? I won’t diagnose, I’m a mirror for your own patterns.`} tail="none" /></div>
      </section>

      {llm && llm.p < 1 && (
        <div className="card mt-4 p-4 text-sm">
          <div className="h-2 overflow-hidden rounded-full bg-paper-2"><motion.div className="h-full bg-neel" animate={{ width: `${llm.p * 100}%` }} /></div>
          <p className="mt-2 line-clamp-2 text-xs text-ink-faint">{llm.t}</p>
        </div>
      )}

      <div className="mt-6 flex-1 space-y-3">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'me' ? 'justify-end' : ''}`}>
              <div className={`max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-3 ${m.role === 'me' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-line bg-card'}`}>
                {m.text}
                {m.role === 'mirror' && isCrisis(msgs[msgs.indexOf(m) - 1]?.text ?? '') && (
                  <div className="mt-3 flex gap-2"><a className="btn btn-urgent py-2 text-sm" href="tel:14416">Call 14416</a><a className="btn btn-ghost py-2 text-sm" href="tel:112">112</a></div>
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
            <input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => getBuddy().state === 'IDLE' && setCharState('LISTENING')} onBlur={() => getBuddy().state === 'LISTENING' && setCharState('IDLE')} placeholder={rec ? 'Listening… tap mic to stop' : 'Say anything'} className="flex-1 bg-transparent outline-none" />
            <button type="button" onClick={mic} className={`grid size-10 place-items-center rounded-full ${rec ? 'animate-pulse bg-care text-white' : 'bg-paper-2'}`} aria-label="Speak"><MicIcon /></button>
            <button className="grid size-10 place-items-center rounded-full bg-ink text-paper" aria-label="Send" disabled={busy}>↑</button>
          </form>
        </div>
      </div>
    </motion.main>
  )
}
