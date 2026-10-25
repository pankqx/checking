import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Atmosphere } from './components/fx'
import { db } from './lib/db'
import { go, useRoute, type Route } from './lib/nav'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import CheckIn from './screens/CheckIn'
import Insights from './screens/Insights'
import Thoughts from './screens/Thoughts'
import Meditation from './screens/Meditation'
import Release from './screens/Release'
import Body from './screens/Body'
import Companion from './screens/Companion'
import Planner from './screens/Planner'
import Pendant from './screens/Pendant'
import You from './screens/You'
import Play from './screens/Play'
import CalmSea from './games/CalmSea'
import { introSeen, introWanted, markIntroSeen } from './lib/intro'

const SCREENS: Record<Route, () => React.ReactElement> = {
  home: Home, checkin: CheckIn, insights: Insights, thoughts: Thoughts, meditation: Meditation,
  release: Release, body: Body, companion: Companion, planner: Planner, pendant: Pendant, you: You, play: Play,
}

export default function App() {
  const [intro, setIntro] = useState(() => introWanted() && !introSeen())
  return (
    <>
      <AnimatePresence>
        {intro && <CalmSea key="intro" onDone={() => { markIntroSeen(); setIntro(false) }} />}
      </AnimatePresence>
      {!intro && <Main />}
    </>
  )
}

function Main() {
  const route = useRoute()
  const profile = useLiveQuery(() => db.profile.get('me').then((p) => p ?? null), [])
  if (profile === undefined) return null
  if (!profile?.onboardedAt) return <><Atmosphere /><Onboarding /></>
  const S = SCREENS[route] ?? Home
  const immersive = route === 'meditation'
  return (
    <>
      <Atmosphere />
      <AnimatePresence mode="wait" onExitComplete={() => scrollTo({ top: 0, behavior: 'instant' })}>
        <S key={route} />
      </AnimatePresence>
      {!immersive && <Dock route={route} />}
    </>
  )
}

const ICONS: Record<string, React.ReactElement> = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  planner: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  companion: <path d="M5 18.5V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8.5z" />,
  you: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5" /></>,
}

function Dock({ route }: { route: Route }) {
  const item = (r: Route, label: string) => (
    <button onClick={() => go(r)} className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors duration-500 ${route === r ? 'text-ink' : 'text-ink-faint'}`} aria-current={route === r ? 'page' : undefined}>
      {route === r && <motion.span layoutId="dock-dot" className="absolute top-1 h-1 w-5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 260, damping: 30 }} />}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className="mt-1">{ICONS[r]}</svg>
      {label}
    </button>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center rounded-full border border-line bg-card/90 px-2 shadow-[var(--shadow)] backdrop-blur-xl">
        {item('home', 'Today')}
        {item('planner', 'Plan')}
        <button onClick={() => go('checkin')} className="relative -mt-7 grid size-16 place-items-center rounded-full text-white shadow-[0_12px_30px_-10px_rgba(46,53,115,.65)] ring-8 ring-paper" style={{ background: 'radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--sky) 80%, #fff), color-mix(in oklab, var(--accent) 85%, #000) 78%)' }} aria-label="Check in">
          <span className="breathe absolute inset-0 rounded-full border-2 border-[color-mix(in_oklab,var(--sky)_70%,transparent)]" style={{ ['--breathe-to' as string]: 1.18 }} aria-hidden />
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {item('companion', 'Mirror')}
        {item('you', 'You')}
      </div>
    </nav>
  )
}
