import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Buddy, Caption } from '../components/Buddy'
import { characters } from '../character/characters'
import { Doodle } from '../components/ui'
import { say, setCharacter, setUi, useBuddy } from '../lib/buddy'
import { bleSupported, connectHeartRate } from '../lib/ble'
import { db, type Profile } from '../lib/db'
import { seedDemo } from '../lib/seed'

// Soft onboarding: one gentle question at a time, every one skippable, no
// progress bar pressure, and a warm reply to each answer.

const REASONS = ['Exams', 'Assignments', 'Sleep', 'Friends', 'Family', 'Money', 'Future plans', 'Feeling low', 'Just curious']
export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Omit<Profile, 'id'>>({ reasons: [] })
  const [sleepKnown, setSleepKnown] = useState(true)
  const [watch, setWatch] = useState<'idle' | 'busy' | 'ok' | 'no'>('idle')
  const b = useBuddy()
  const cfg = characters[b.character]
  const next = () => setStep((s) => s + 1)

  // The companion asks each question out loud (captions always on).
  useEffect(() => {
    const lines = [
      `Hi! I'm ${cfg.name}. I help you notice how you're really doing, before things get heavy. No tests. No scores. And everything stays on this phone.`,
      'First, pick a look. Calm paper, or a night full of stars. You can switch anytime.',
      'What should I call you? A name, a nickname, anything.',
      "What's been taking up space in your head lately? Pick any, or none at all.",
      'How much sleep feels normal for you? This helps me compare you with you.',
      'Wear a smartwatch? Totally optional. Your body often notices stress before your mind does.',
      `That's all. Really! Just tell me how you are once a day, and I'll do the noticing.`,
    ]
    const t = setTimeout(() => say(lines[step] ?? '', { greet: step === 0 || step === 6, expression: step === 6 ? 'happy' : 'neutral' }), step === 0 ? 700 : 250)
    return () => clearTimeout(t)
  }, [step, cfg.name])

  const finish = async (demo: boolean) => {
    await db.profile.put({ id: 'me', ...p, usualSleep: sleepKnown ? p.usualSleep ?? 7 : undefined, onboardedAt: Date.now() })
    if (demo) await seedDemo()
    location.hash = '#/home'
  }

  const tryWatch = async () => {
    setWatch('busy')
    try {
      const link = await connectHeartRate(() => {}, () => {})
      setWatch('ok')
      setP((x) => ({ ...x, watchOptIn: true }))
      setTimeout(() => link.disconnect(), 1500)
    } catch {
      setWatch('no')
    }
  }

  const steps: Step[] = [
    {
      body: (
        <>
          <h1 className="display text-5xl leading-[1.02]">Meet <span className="display-i text-sindoor">{cfg.name}</span>.</h1>
          <p className="mt-2 text-ink-soft">Your MindMirror companion. {cfg.tagline}.</p>
          <div className="mt-4 flex gap-2">
            {Object.values(characters).map((c) => (
              <button key={c.id} className="chip" aria-pressed={b.character === c.id} onClick={() => setCharacter(c.id)}>{c.name}</button>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-faint"><LockIcon /> Everything stays on this phone.</p>
        </>
      ),
      primary: ['Say hello 👋', next],
    },
    {
      body: (
        <>
          <Kicker>your world</Kicker>
          <h1 className="display text-4xl">Pick a look.</h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {([['minimal', 'Minimal', 'Paper, ink, calm'], ['grandeur', 'Grandeur', 'Stars, aurora, glow']] as const).map(([id, label, hint]) => (
              <button key={id} onClick={() => setUi(id)} className={`overflow-hidden rounded-3xl border text-left transition ${b.ui === id ? 'border-transparent ring-2 ring-sindoor' : 'border-line'}`}>
                <div className="relative h-28" style={id === 'minimal' ? { background: '#f3eee4' } : { background: 'radial-gradient(80% 80% at 70% 20%, rgba(167,139,250,.6), transparent), radial-gradient(60% 60% at 10% 90%, rgba(94,234,212,.4), transparent), #07060d' }}>
                  {id === 'minimal'
                    ? <><span className="absolute left-4 top-4 size-10 rounded-full bg-[#d2553a]" /><span className="absolute left-16 top-6 h-2 w-16 rounded bg-[#1e1b16]" /><span className="absolute left-16 top-10 h-2 w-10 rounded bg-[#9a9284]" /><span className="absolute bottom-3 left-4 right-4 h-8 rounded-xl bg-[#e3a935]" /></>
                    : <>{[...Array(12)].map((_, i) => <span key={i} className="absolute size-1 rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, opacity: 0.4 + (i % 3) * 0.2 }} />)}<span className="absolute bottom-3 left-4 right-4 h-8 rounded-xl border border-white/20 bg-white/10" /></>}
                </div>
                <div className="bg-card p-3"><p className="font-semibold">{label}</p><p className="text-xs text-ink-faint">{hint}</p></div>
              </button>
            ))}
          </div>
        </>
      ),
      primary: ['Continue', next],
    },
    {
      body: (
        <>
          <Kicker>a small thing first</Kicker>
          <h1 className="display text-4xl">What should I call you?</h1>
          <input
            autoFocus
            value={p.name ?? ''}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && next()}
            onBlur={() => p.name && say(`Nice to meet you, ${p.name}!`, { expression: 'happy' })}
            placeholder="a name, a nickname, anything"
            className="mt-8 w-full border-b-2 border-ink bg-transparent pb-2 text-3xl outline-none placeholder:text-ink-faint/60 display-i"
          />
          <AnimatePresence>{p.name && <Reply>Nice to meet you, {p.name} 🌼</Reply>}</AnimatePresence>
        </>
      ),
      primary: ['Continue', next],
      skip: "I'd rather not say",
    },
    {
      body: (
        <>
          <Kicker>pick any, or none</Kicker>
          <h1 className="display text-4xl">What&rsquo;s taking up space in your head lately?</h1>
          <div className="mt-8 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} className="chip" aria-pressed={p.reasons.includes(r)} onClick={() => setP({ ...p, reasons: p.reasons.includes(r) ? p.reasons.filter((x) => x !== r) : [...p.reasons, r] })}>
                {r}
              </button>
            ))}
          </div>
          <AnimatePresence>{p.reasons.length > 0 && <Reply>{p.reasons.length > 2 ? "That's a lot to carry. We'll go one thing at a time." : 'Got it. Thanks for trusting me with that.'}</Reply>}</AnimatePresence>
        </>
      ),
      primary: ['Continue', next],
      skip: 'Skip for now',
    },
    {
      body: (
        <>
          <Kicker>so I can compare you with you</Kicker>
          <h1 className="display text-4xl">How much sleep feels normal for you?</h1>
          <div className={`mt-10 transition-opacity ${sleepKnown ? '' : 'opacity-30'}`}>
            <div className="flex items-end justify-between">
              <span className="text-3xl">🌙</span>
              <span className="display text-7xl">{p.usualSleep ?? 7}<span className="text-3xl text-ink-soft"> h</span></span>
              <span className="text-3xl">☀️</span>
            </div>
            <input type="range" min={4} max={10} step={0.5} value={p.usualSleep ?? 7} onChange={(e) => { setSleepKnown(true); setP({ ...p, usualSleep: +e.target.value }) }} className="mt-4 w-full" />
          </div>
          <button className="chip mt-6" aria-pressed={!sleepKnown} onClick={() => setSleepKnown(!sleepKnown)}>Not sure, you figure it out</button>
        </>
      ),
      primary: ['Continue', next],
    },
    {
      body: (
        <>
          <Kicker>totally optional</Kicker>
          <div className="mb-4 flex items-center gap-4 text-sindoor">
            <Doodle kind="heart" className="size-16" />
          </div>
          <h1 className="display text-4xl">Wear a smartwatch or fitness band?</h1>
          <p className="mt-4 text-ink-soft">If you like, I can read your heart rate. Bodies often notice tiredness and stress before our minds admit it. You can turn this off anytime.</p>
          {!bleSupported() && <p className="mt-3 text-sm text-ink-faint">This browser can&rsquo;t use Bluetooth. You can import watch data later from the Body page.</p>}
          {watch === 'ok' && <Reply>Connected! I&rsquo;ll only read heart rate, nothing else.</Reply>}
          {watch === 'no' && <Reply>No worries, that didn&rsquo;t connect. You can try again later from Body.</Reply>}
        </>
      ),
      primary: watch === 'ok' ? ['Continue', next] : bleSupported() ? [watch === 'busy' ? 'Looking…' : 'Connect my watch', tryWatch] : ['Continue', next],
      skip: watch === 'ok' ? undefined : 'Maybe later',
    },
    {
      body: (
        <>
          <h1 className="display text-5xl">That&rsquo;s all.<br /><span className="display-i text-sindoor">Really.</span></h1>
          <p className="mt-4 text-lg text-ink-soft">Tell me more whenever you want, or never. A 30-second check-in each day is all I need to start noticing patterns for you.</p>
        </>
      ),
      primary: ['Start fresh', () => finish(false)],
      secondary: ['Explore with sample data', () => finish(true)],
    },
  ]

  const s = steps[step]
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-6">
      <div className="relative z-10 mb-2 flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <span key={i} className="block h-1.5 rounded-full transition-all duration-500" style={{ width: i === step ? 22 : 6, background: i <= step ? 'var(--sindoor)' : 'var(--line)' }} />
          ))}
        </div>
        {step > 0 && step < steps.length - 1 && (
          <button onClick={() => setStep(steps.length - 1)} className="text-sm text-ink-faint underline-offset-4 hover:underline">skip all</button>
        )}
      </div>
      <div className="relative -mt-4 flex flex-col items-center">
        <Buddy height={step === 0 ? 330 : 230} />
        <div className="-mt-3 w-full"><Caption tail="none" /></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }} className="mt-6 flex-1">
          {s.body}
        </motion.div>
      </AnimatePresence>
      <div className="mt-10 flex flex-col gap-3">
        <button className="btn py-4 text-lg" onClick={s.primary[1]} disabled={watch === 'busy'}>{s.primary[0]}</button>
        {s.secondary && <button className="btn btn-ghost" onClick={s.secondary[1]}>{s.secondary[0]}</button>}
        {s.skip && <button className="py-2 text-ink-faint" onClick={next}>{s.skip}</button>}
      </div>
    </div>
  )
}

interface Step { body: React.ReactNode; primary: [string, () => void]; skip?: string; secondary?: [string, () => void] }

const Kicker = ({ children }: { children: React.ReactNode }) => <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-sindoor">{children}</p>

const Reply = ({ children }: { children: React.ReactNode }) => (
  <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 inline-block rounded-2xl rounded-bl-sm bg-paper-2 px-4 py-3 text-ink">
    {children}
  </motion.p>
)

export const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)
