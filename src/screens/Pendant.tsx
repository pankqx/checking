import { AnimatePresence, motion } from 'framer-motion'
import { Screen, Section, Stamp } from '../components/ui'
import { bleSupported } from '../lib/ble'
import { voiceSizes, type NecklaceVoice } from '../lib/necklace/voice'
import {
  pairPendant, setNecklaceVoice, setNecklaceVolume, startListening, startSimulator, stopListening, testNecklaceVoice, testStoredPhrase, unpair, usePendant, type PendantStatus,
} from '../lib/pendantStore'

// Pairing + live view for the MindMirror necklace (XIAO ESP32S3 Sense + MAX98357A speaker).

const LED: Record<PendantStatus, string> = {
  idle: '#9a9284', pairing: '#8c98ee', connected: '#5fb5a5', listening: '#2e3a8c', uploading: '#2e3a8c', processing: '#e3a935',
  receiving: '#e3a935', speaking: '#8aa57f', done: '#8aa57f', reconnecting: '#8c98ee', error: '#d2553a',
}

const LIVE: PendantStatus[] = ['connected', 'listening', 'uploading', 'processing', 'receiving', 'speaking', 'done', 'reconnecting']
const BUSY: PendantStatus[] = ['uploading', 'processing', 'receiving', 'speaking']

export default function Pendant() {
  const p = usePendant()
  const live = LIVE.includes(p.status)
  const busy = BUSY.includes(p.status)
  const pct = (x?: number) => `${Math.round(x ?? 0)}%`

  const headline: Record<PendantStatus, React.ReactNode> = {
    idle: <><p className="display text-2xl">Not paired yet</p><p className="mt-1 text-sm text-ink-soft">Press, speak, let go. Your necklace answers out loud.</p></>,
    pairing: <><p className="display text-2xl">Looking for your necklace…</p><p className="mt-1 text-sm text-ink-soft">Pick <b>MindMirror-xxxx</b> in the popup.</p></>,
    connected: <><p className="display text-2xl">{p.name}</p><p className="mt-1 text-sm text-ink-soft">{p.simulated ? 'Hold the button below and speak.' : 'Hold the necklace button and speak.'}</p></>,
    listening: <p className="display-i text-2xl">Listening…</p>,
    uploading: <p className="display-i text-2xl">Got it…</p>,
    processing: <p className="display-i text-2xl">{p.progress != null ? `Getting ears ready ${pct(p.progress)}` : 'Thinking, on your phone…'}</p>,
    receiving: <p className="display-i text-2xl">{p.progress != null ? `Getting the voice ready ${pct(p.progress)}` : `Sending the reply to your necklace ${pct((p.sent ?? 0) * 100)}`}</p>,
    speaking: <><p className="display-i text-2xl">Speaking through your necklace</p><p className="mt-1 text-sm text-ink-soft">Press the button to interrupt.</p></>,
    done: <p className="display-i text-2xl">Done. Press again any time.</p>,
    reconnecting: <><p className="display text-2xl">Reconnecting…</p><p className="mt-1 text-sm text-ink-soft">Keep the necklace near the phone.</p></>,
    error: <><p className="display text-2xl">Something went wrong</p><p className="mt-1 text-sm text-ink-soft">{p.error?.includes('cancel') ? 'Cancelled. Try again whenever.' : p.error}</p></>,
  }

  return (
    <Screen title={<>Your <span className="display-i text-sindoor">necklace</span>.</>} kicker="hands-free companion">
      <div className="card relative flex flex-col items-center overflow-hidden px-6 pb-6 pt-2" style={{ background: 'linear-gradient(180deg, var(--card), var(--paper-2))' }}>
        <PendantArt led={LED[p.status]} pulse={p.status === 'listening' || p.status === 'pairing' || p.status === 'reconnecting'} spin={p.status === 'processing' || p.status === 'receiving'} speaking={p.status === 'speaking'} level={p.level} />
        <AnimatePresence mode="wait">
          <motion.div key={p.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
            {headline[p.status]}
          </motion.div>
        </AnimatePresence>
        {live && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Stamp color="var(--pista)">{p.status === 'reconnecting' ? 'reconnecting' : 'connected'}</Stamp>
            {p.battery != null && !p.simulated && <Stamp color="var(--ink-soft)">battery {p.battery}%</Stamp>}
            {p.simulated ? <Stamp color="var(--haldi)">simulator · phone speaker</Stamp> : p.speaker && <Stamp color="var(--neel)">speaker on necklace</Stamp>}
            {p.warming != null && <Stamp color="var(--haldi)">preparing voice {p.warming}%</Stamp>}
          </div>
        )}
      </div>

      {(p.status === 'idle' || p.status === 'error') && (
        <div className="mt-4 space-y-3">
          <ol className="card space-y-3 p-5 text-sm">
            {['Switch the necklace on. It plays a two-note chime and the light glows softly.', 'Keep it near your phone, with Bluetooth on. Use Chrome on Android.', 'Tap “Pair necklace” and choose MindMirror in the list.'].map((s, i) => (
              <li key={i} className="flex gap-3"><span className="display text-xl text-sindoor">{i + 1}</span><span className="pt-1">{s}</span></li>
            ))}
          </ol>
          <button className="btn w-full py-4" onClick={pairPendant} disabled={!bleSupported()}>Pair necklace</button>
          <button className="btn btn-ghost w-full" onClick={startSimulator}>No necklace? Try with your phone mic</button>
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
              disabled={busy}
            >
              {p.status === 'listening' ? 'Release to send' : 'Hold to talk'}
            </motion.button>
          )}
          {(p.note || p.error) && <p className="card p-3 text-sm text-ink-soft">{p.note ?? p.error}</p>}
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

          {!p.simulated && (
            <div className="card space-y-4 p-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">Necklace voice</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['quick', 'natural'] as NecklaceVoice[]).map((v) => (
                    <button key={v} onClick={() => setNecklaceVoice(v)} className="chip justify-center py-2" aria-pressed={p.voice === v}>
                      {v === 'quick' ? 'Quick' : 'Natural'} · {voiceSizes[v]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-faint">Made on this phone and sent to the necklace. Download the natural voice on Wi-Fi.</p>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">Volume {p.volume}</span>
                <input type="range" min={10} max={100} step={5} value={p.volume} onChange={(e) => setNecklaceVolume(Number(e.target.value))} className="mt-2 w-full" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ghost py-3 text-sm" onClick={testStoredPhrase} disabled={busy}>Speaker test</button>
                <button className="btn btn-ghost py-3 text-sm" onClick={testNecklaceVoice} disabled={busy}>Voice test</button>
              </div>
              <p className="text-xs text-ink-faint">Speaker test plays a line stored in the necklace. Voice test makes speech on the phone and sends it over Bluetooth.{p.fw ? ` Firmware ${p.fw}.` : ''}</p>
            </div>
          )}
          <button className="w-full py-2 text-sm text-ink-faint underline underline-offset-4" onClick={unpair}>Unpair</button>
        </div>
      )}

      <Section title="How it stays private">
        <div className="card grid grid-cols-3 gap-px overflow-hidden bg-line p-0 text-center text-xs">
          {[['🎙️', 'The mic is on only while you hold the button'], ['📱', 'Words and the reply voice are made on your phone, not a server'], ['🗑️', 'Recordings are never saved, only the words']].map(([e, t]) => (
            <div key={t} className="bg-card p-3"><div className="text-2xl">{e}</div><p className="mt-1 text-ink-soft">{t}</p></div>
          ))}
        </div>
      </Section>
    </Screen>
  )
}

function PendantArt({ led, pulse, spin, speaking, level }: { led: string; pulse: boolean; spin: boolean; speaking: boolean; level: number }) {
  return (
    <svg viewBox="0 0 200 220" width="210" height="230" aria-hidden>
      <path d="M40 0 C40 60 70 95 100 108 C130 95 160 60 160 0" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
      <circle cx="100" cy="112" r="6" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      <motion.circle cx="100" cy="160" r={46 + level * 40} fill={led} opacity={0.18} animate={pulse ? { r: [46, 58, 46], opacity: [0.25, 0.05, 0.25] } : {}} transition={{ duration: 2.4, repeat: Infinity }} />
      {speaking && [0, 1, 2].map((i) => (
        <motion.circle key={i} cx="100" cy="160" r="44" fill="none" stroke={led} strokeWidth="2" initial={{ r: 44, opacity: 0.6 }} animate={{ r: 92, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }} />
      ))}
      <circle cx="100" cy="160" r="42" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="100" cy="160" r="32" fill="url(#stone)" />
      <defs>
        <radialGradient id="stone" cx="40%" cy="35%"><stop offset="0" stopColor="#fff" stopOpacity=".6" /><stop offset="1" stopColor="var(--paper-2)" /></radialGradient>
      </defs>
      <motion.circle cx="100" cy="160" r="37" fill="none" stroke={led} strokeWidth="4" strokeLinecap="round" strokeDasharray={spin ? '40 200' : '232 0'} animate={spin ? { rotate: 360 } : { rotate: 0 }} transition={spin ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : {}} style={{ originX: '100px', originY: '160px' }} />
      {/* speaker grille */}
      {[-8, 0, 8].map((dx) => [-8, 0, 8].map((dy) => <circle key={`${dx}${dy}`} cx={100 + dx} cy={160 + dy} r="1.6" fill="var(--ink-soft)" />))}
    </svg>
  )
}
