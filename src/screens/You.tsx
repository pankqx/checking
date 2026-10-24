import { useState } from 'react'
import { Screen, Section } from '../components/ui'
import { db, wipeEverything } from '../lib/db'
import { go } from '../lib/nav'
import { seedDemo } from '../lib/seed'
import { useData } from '../lib/useData'

type Theme = 'auto' | 'light' | 'dark'
const readTheme = (): Theme => { try { return (localStorage.getItem('mm-theme') as Theme) ?? 'auto' } catch { return 'auto' } }

export default function You() {
  const d = useData()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const applyTheme = (t: Theme) => {
    setTheme(t)
    try { localStorage.setItem('mm-theme', t) } catch { /* private mode */ }
    if (t === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }

  const exportAll = async () => {
    const dump = Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()])))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }))
    a.download = `mindmirror-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const records = d.checkins.length + d.thoughts.length + d.tasks.length + d.health.length + d.habits.length

  return (
    <Screen title={<>You, <span className="display-i text-sindoor">kept private</span>.</>} kicker="settings · data · help">
      <div className="card p-5">
        <label className="text-xs font-semibold uppercase tracking-widest text-ink-faint">Name</label>
        <input defaultValue={d.profile?.name} onBlur={(e) => db.profile.update('me', { name: e.target.value || undefined })} placeholder="what should I call you?" className="display mt-1 w-full bg-transparent text-3xl outline-none" />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-ink-faint">Usual sleep</label>
        <div className="flex items-center gap-3">
          <input type="range" min={4} max={10} step={0.5} defaultValue={d.profile?.usualSleep ?? 7} onChange={(e) => db.profile.update('me', { usualSleep: +e.target.value })} className="flex-1" />
          <span className="display text-xl">{d.profile?.usualSleep ?? '–'} h</span>
        </div>
      </div>

      <Section title="Look">
        <div className="flex gap-2">{(['auto', 'light', 'dark'] as Theme[]).map((t) => <button key={t} className="chip flex-1 capitalize" aria-pressed={theme === t} onClick={() => applyTheme(t)}>{t === 'auto' ? 'Match phone' : t === 'light' ? 'Day paper' : 'Night ink'}</button>)}</div>
      </Section>

      <Section title="Devices">
        <div className="grid grid-cols-2 gap-2">
          <button className="card p-4 text-left" onClick={() => go('body')}><p className="font-semibold">Watch & body</p><p className="text-sm text-ink-faint">heart rate, import</p></button>
          <button className="card p-4 text-left" onClick={() => go('pendant')}><p className="font-semibold">Pendant</p><p className="text-sm text-ink-faint">pair, talk</p></button>
        </div>
      </Section>

      <Section title="Your data">
        <div className="card space-y-4 p-5">
          <p className="text-sm text-ink-soft"><b className="text-ink">{records} records</b>, all stored in this browser only (IndexedDB). No account. No server. No analytics.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={exportAll}>Export as JSON</button>
            {!d.checkins.length && <button className="btn btn-ghost" onClick={seedDemo}>Load sample data</button>}
          </div>
          <button className="btn w-full bg-sindoor" onClick={() => confirm('Delete everything MindMirror knows about you? This cannot be undone.') && wipeEverything()}>Delete all my data</button>
        </div>
      </Section>

      <Section title="If it gets heavy">
        <div className="card space-y-3 p-5">
          <p className="text-sm text-ink-soft">MindMirror notices patterns. It does not diagnose. If you&rsquo;re struggling, real people can help, today.</p>
          <a href="tel:14416" className="flex items-center justify-between rounded-2xl bg-paper-2 p-4"><span><b>Tele-MANAS</b><br /><span className="text-sm text-ink-faint">free · 24×7 · many languages</span></span><span className="display text-2xl">14416</span></a>
          <a href="tel:112" className="flex items-center justify-between rounded-2xl bg-paper-2 p-4"><span><b>Emergency</b></span><span className="display text-2xl">112</span></a>
          <p className="text-sm text-ink-soft">Your campus counsellor: ask your department office or student welfare cell.</p>
        </div>
      </Section>

      <p className="mt-10 text-center text-xs text-ink-faint">MindMirror · team HTTP Dino · St Aloysius (Deemed to be University)</p>
    </Screen>
  )
}
