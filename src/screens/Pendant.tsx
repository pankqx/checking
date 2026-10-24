import { AnimatePresence, motion } from 'framer-motion'
import { Screen, Section, Stamp } from '../components/ui'
import { bleSupported } from '../lib/ble'
import { pairPendant, startListening, startSimulator, stopListening, unpair, usePendant, type PendantStatus } from '../lib/pendantStore'

// Pairing + live view for the MindMirror pendant (ESP32-S3 + mic + LED + haptic).

const LED: Record<PendantStatus, string> = {
  idle: '#9a9284', pairing: '#8c98ee', connected: '#8aa57f', listening: '#2e3a8c', thinking: '#e3a935', error: '#d2553a',
}

export default function Pendant() {
  const p = usePendant()
  const live = p.status === 'connected' || p.status === 'listening' || p.status === 'thinking'

  return (
    <Screen title={<>Your <span className="display-i text-sindoor">pendant</span>.</>} kicker="hands-free companion">
      <div className="card relative flex flex-col items-center overflow-hidden px-6 pb-6 pt-2" style={{ background: 'linear-gradient(180deg, var(--card), var(--paper-2))' }}>
        <PendantArt led={LED[p.status]} pulse={p.status === 'listening' || p.status === 'pairing'} spin={p.status === 'thinking'} level={p.level} />
        <AnimatePresence mode="wait">
          <motion.div key={p.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
            {p.status === 'idle' && <><p className="display text-2xl">Not paired yet</p><p className="mt-1 text-sm text-ink-soft">Press, speak, let go. Mirror answers with a gentle tap and a voice on your phone.</p></>}
            {p.status === 'pairing' && <><p className="display text-2xl">Looking for your pendant…</p><p className="mt-1 text-sm text-ink-soft">Pick <b>MindMirror-xxxx</b> in the popup.</p></>}
            {p.status === 'connected' && <><p className="display text-2xl">{p.name}</p><p className="mt-1 text-sm text-ink-soft">{p.simulated ? 'Hold the button below and speak.' : 'Hold the pendant button and speak.'}</p></>}
            {p.status === 'listening' && <p className="display-i text-2xl">Listening…</p>}
            {p.status === 'thinking' && <p className="display-i text-2xl">{p.progress != null ? `Getting the voice model ready ${Math.round(p.progress)}%` : 'Thinking, on your device…'}</p>}
            {p.status === 'error' && <><p className="display text-2xl">Couldn&rsquo;t connect</p><p className="mt-1 text-sm text-ink-soft">{p.error?.includes('cancel') ? 'Cancelled. Try again whenever.' : p.error}</p></>}
          </motion.div>
        </AnimatePresence>
        {live && (
          <div className="mt-3 flex gap-2">
            <Stamp color="var(--pista)">connected</Stamp>
            {p.battery != null && <Stamp color="var(--ink-soft)">battery {p.battery}%</Stamp>}
            {p.simulated && <Stamp color="var(--haldi)">simulator</Stamp>}
          </div>
        )}
      </div>

      {(p.status === 'idle' || p.status === 'error') && (
        <div className="mt-4 space-y-3">
          <ol className="card space-y-3 p-5 text-sm">
            {['Hold the pendant button for 3 seconds, until the light breathes indigo.', 'Keep it near your phone, with Bluetooth on.', 'Tap “Pair pendant” and choose MindMirror in the list.'].map((s, i) => (
              <li key={i} className="flex gap-3"><span className="display text-xl text-sindoor">{i + 1}</span><span className="pt-1">{s}</span></li>
            ))}
          </ol>
          <button className="btn w-full py-4" onClick={pairPendant} disabled={!bleSupported()}>Pair pendant</button>
          <button className="btn btn-ghost w-full" onClick={startSimulator}>No pendant? Try with your phone mic</button>
          {!bleSupported() && <p className="text-center text-xs text-ink-faint">Pairing needs Chrome or Edge on Android, Windows or Mac.</p>}
        </div>
      )}

      {live && (
        <div className="mt-4 space-y-3">
          {p.simulated && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={() => p.status === 'listening' && stopListening()}
              className="btn w-full select-none py-6 text-lg"
              style={{ background: p.status === 'listening' ? 'var(--neel)' : undefined }}
              disabled={p.status === 'thinking'}
            >
              {p.status === 'listening' ? 'Release to send' : 'Hold to talk'}
            </motion.button>
          )}
          {p.lastHeard && (
            <div className="card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">You said</p>
              <p className="mt-1">{p.lastHeard}</p>
              {p.lastReply && (
                <>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-ink-faint">Mirror</p>
                  <p className="display-i mt-1 text-lg leading-snug">{p.lastReply}</p>
                </>
              )}
            </div>
          )}
          <button className="w-full py-2 text-sm text-ink-faint underline underline-offset-4" onClick={unpair}>Unpair</button>
        </div>
      )}

      <Section title="How it stays private">
        <div className="card grid grid-cols-3 gap-px overflow-hidden bg-line p-0 text-center text-xs">
          {[['🎙️', 'Audio only streams while you hold the button'], ['📱', 'Speech is transcribed on your phone, not a server'], ['🗑️', 'Recordings are never saved, only the words']].map(([e, t]) => (
            <div key={t} className="bg-card p-3"><div className="text-2xl">{e}</div><p className="mt-1 text-ink-soft">{t}</p></div>
          ))}
        </div>
      </Section>
    </Screen>
  )
}

function PendantArt({ led, pulse, spin, level }: { led: string; pulse: boolean; spin: boolean; level: number }) {
  return (
    <svg viewBox="0 0 200 220" width="210" height="230" aria-hidden>
      <path d="M40 0 C40 60 70 95 100 108 C130 95 160 60 160 0" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
      <circle cx="100" cy="112" r="6" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      <motion.circle cx="100" cy="160" r={46 + level * 40} fill={led} opacity={0.18} animate={pulse ? { r: [46, 58, 46], opacity: [0.25, 0.05, 0.25] } : {}} transition={{ duration: 2.4, repeat: Infinity }} />
      <circle cx="100" cy="160" r="42" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="100" cy="160" r="32" fill="url(#stone)" />
      <defs>
        <radialGradient id="stone" cx="40%" cy="35%"><stop offset="0" stopColor="#fff" stopOpacity=".6" /><stop offset="1" stopColor="var(--paper-2)" /></radialGradient>
      </defs>
      <motion.circle cx="100" cy="160" r="37" fill="none" stroke={led} strokeWidth="4" strokeLinecap="round" strokeDasharray={spin ? '40 200' : '232 0'} animate={spin ? { rotate: 360 } : { rotate: 0 }} transition={spin ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : {}} style={{ originX: '100px', originY: '160px' }} />
      {[0, 1, 2].map((i) => <circle key={i} cx={92 + i * 8} cy="160" r="1.8" fill="var(--ink-soft)" />)}
    </svg>
  )
}
