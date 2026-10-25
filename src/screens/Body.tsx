import { motion } from 'framer-motion'
import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Screen, Section, Stamp } from '../components/ui'
import { healthDaily } from '../lib/analysis'
import { bleSupported } from '../lib/ble'
import { db, type HealthSample } from '../lib/db'
import { useData } from '../lib/useData'
import { connectWatch, disconnectWatch, useWatch } from '../lib/watchStore'

// Body data, always opt-in. Two ways in:
//  • Live: any watch/strap that broadcasts standard Bluetooth heart rate.
//  • Import: a CSV export (date, steps, sleep_hours, resting_hr).

export default function Body() {
  const d = useData()
  const w = useWatch()
  const [msg, setMsg] = useState('')
  const steps = healthDaily(d.health, 'steps').slice(-14).map((p) => ({ ...p, label: new Date(p.day + 'T12:00').toLocaleDateString('en-IN', { weekday: 'narrow' }) }))
  const rhr = healthDaily(d.health, 'restingHr')
  const sources = new Set(d.health.map((h) => h.source))

  const importCsv = async (f: File) => {
    const rows = (await f.text()).trim().split(/\r?\n/)
    const head = rows.shift()!.toLowerCase().split(',').map((s) => s.trim())
    const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)))
    const ci = { day: col(['date', 'day']), steps: col(['step']), sleep: col(['sleep']), rhr: col(['resting', 'rhr']) }
    if (ci.day < 0) return setMsg('I need a “date” column (YYYY-MM-DD).')
    const out: HealthSample[] = []
    for (const r of rows) {
      const c = r.split(',')
      const day = c[ci.day]?.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const at = +new Date(day + 'T12:00')
      if (ci.steps >= 0 && c[ci.steps]) out.push({ at, day, kind: 'steps', value: +c[ci.steps], source: 'import' })
      if (ci.sleep >= 0 && c[ci.sleep]) out.push({ at, day, kind: 'sleep', value: +c[ci.sleep], source: 'import' })
      if (ci.rhr >= 0 && c[ci.rhr]) out.push({ at, day, kind: 'restingHr', value: +c[ci.rhr], source: 'import' })
    }
    await db.health.bulkAdd(out.filter((s) => Number.isFinite(s.value)))
    setMsg(`Imported ${out.length} readings from ${rows.length} days. Thank you!`)
  }

  const template = () => {
    const blob = new Blob(['date,steps,sleep_hours,resting_hr\n2026-10-20,6200,7.1,64\n2026-10-21,5400,6.5,66\n'], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mindmirror-health-template.csv'
    a.click()
  }

  return (
    <Screen title={<>Listen to your <span className="display-i text-accent">body</span>.</>} kicker="body · optional" tint="var(--pista)">
      <div className="card relative overflow-hidden p-6 text-center">
        <motion.div className="mx-auto grid size-40 place-items-center rounded-full" style={{ background: 'color-mix(in oklab, var(--pista) 22%, transparent)' }} animate={w.bpm ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: w.bpm ? 60 / w.bpm : 1, repeat: Infinity }}>
          <div>
            <p className="display text-6xl">{w.bpm ?? '–'}</p>
            <p className="text-xs uppercase tracking-widest text-ink-faint">bpm</p>
          </div>
        </motion.div>
        {w.hrv != null && <p className="mt-3 text-sm text-ink-soft">Heart-rate variability (RMSSD): <b>{w.hrv} ms</b></p>}
        <p className="mt-3 text-sm text-ink-soft">{w.status === 'live' ? `Live from ${w.name}` : w.status === 'connecting' ? 'Choose your watch in the popup…' : 'Not connected'}</p>
        {w.error && <p className="mt-1 text-xs text-(--care-ink)">{w.error.includes('cancel') ? 'Cancelled, no worries.' : w.error}</p>}
        <div className="mt-4 flex justify-center gap-2">
          {w.status === 'live' ? <button className="btn btn-ghost" onClick={disconnectWatch}>Disconnect</button> : (
            <button className="btn" onClick={connectWatch} disabled={!bleSupported() || w.status === 'connecting'}>Connect watch</button>
          )}
        </div>
        {!bleSupported() && <p className="mt-3 text-xs text-ink-faint">Bluetooth needs Chrome or Edge (Android, Windows, Mac). On iPhone, use the import below.</p>}
      </div>

      <details className="card mt-3 p-4 text-sm text-ink-soft">
        <summary className="cursor-pointer font-semibold text-ink">Which watches work?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Any band that can <b>broadcast heart rate</b> over Bluetooth: Amazfit (Zepp app → “Heart rate sharing”), Xiaomi Smart Band 8/9 (“Heart rate broadcast”), Garmin (“Broadcast heart rate”), Polar and Coros, plus every BLE chest strap.</li>
          <li>Apple Watch, Fitbit and Noise/boAt don&rsquo;t broadcast. Export their data as CSV and import it here.</li>
          <li>Only heart rate is read. Nothing is sent online.</li>
        </ul>
      </details>

      <Section title="Import from your health app">
        <div className="card p-5">
          <p className="text-sm text-ink-soft">A CSV with <code>date, steps, sleep_hours, resting_hr</code>. Any column is optional.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="btn cursor-pointer">Choose CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} /></label>
            <button className="btn btn-ghost" onClick={template}>Get template</button>
          </div>
          {msg && <p className="mt-3 text-sm text-pista">{msg}</p>}
        </div>
      </Section>

      {steps.length > 1 && (
        <Section title="Steps, last two weeks">
          <div className="card h-44 p-3">
            <ResponsiveContainer>
              <BarChart data={steps}>
                <XAxis dataKey="label" stroke="var(--ink-faint)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--paper-2)' }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 12 }} formatter={(v) => [Math.round(+(v ?? 0)), 'steps']} labelFormatter={() => ''} />
                <Bar dataKey="v" fill="var(--pista)" radius={[8, 8, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="What I keep">
        <div className="card space-y-2 p-5 text-sm">
          <p>{d.health.length} readings{rhr.length ? ` · resting HR on ${rhr.length} days` : ''}</p>
          <div className="flex flex-wrap gap-2">{[...sources].map((s) => <Stamp key={s} color="var(--ink-soft)">{s === 'ble' ? 'live watch' : s}</Stamp>)}</div>
          {d.health.length > 0 && <button className="mt-2 text-(--care-ink) underline underline-offset-4" onClick={() => confirm('Delete all body data?') && db.health.clear()}>Delete body data</button>}
        </div>
      </Section>
    </Screen>
  )
}
