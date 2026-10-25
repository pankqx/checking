import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Screen } from '../components/ui'
import CalmSea from '../games/CalmSea'
import Ripples from '../games/Ripples'
import ZenGarden from '../games/ZenGarden'

type Game = 'sea' | 'ripples' | 'garden'

/** A small piece of ASCII art; `paint` gives each character its colour. */
function Ascii({ lines, paint, className = '' }: { lines: string[]; paint: (ch: string, row: number, col: number) => string; className?: string }) {
  return (
    <pre aria-hidden className={`overflow-hidden font-mono text-[13px] leading-[1.3] ${className}`}>
      {lines.map((l, row) => {
        const runs: [string, string][] = []
        for (let col = 0; col < l.length; col++) {
          const c = paint(l[col], row, col)
          if (runs.length && runs[runs.length - 1][1] === c) runs[runs.length - 1][0] += l[col]
          else runs.push([l[col], c])
        }
        return <div key={row}>{runs.map(([s, c], i) => <span key={i} style={{ color: c }}>{s}</span>)}</div>
      })}
    </pre>
  )
}

const SEA = [
  '   .   +      .     o@@o   .  ',
  ' *        .      .  @@@@     +',
  '  .    +       .    o@@o  .   ',
  '------------_---------=-------',
  ' ~ -~~ . -~~~ - ~~=~ -~ . ~- ~',
  '-~~ . ~ -~~ . ~~ -==~ ~-~ . ~-',
]
const POND = [
  '  .    ~       .     ~    .   ',
  "    ><(('>   .  o O o   .     ",
  '  .    %%%%    O  :  O    ~   ',
  '      %%*@%%    o O o      .  ',
  "   ~   %%%%   .      <'))><   ",
  ' .        ~      .        .   ',
]
const SAND = [
  '------------------------------',
  '                              ',
  '---------/ ----- \\------------',
  "        | / .-. \\ |           ",
  '--------||  (@)  ||-----------',
  "        | \\ '-' / |           ",
  '---------\\ ----- /------------',
]

const GAMES: { id: Game; name: string; line: string; how: string; bg: string; art: React.ReactNode }[] = [
  {
    id: 'sea',
    name: 'Calm the sea',
    line: 'Tap five glowing balls and a stormy screen settles into moonlit waves.',
    how: 'about 1 minute',
    bg: 'linear-gradient(#0a0f2c, #20255e 55%, #141d4a)',
    art: <Ascii lines={SEA} paint={(ch, r, c) => (r < 3 ? ('@o'.includes(ch) && c > 18 ? '#f6efd2' : '#d9dcff') : r === 3 ? '#6c78b8' : c >= 17 && c <= 21 ? '#f1e4b8' : '#80b1d8')} />,
  },
  {
    id: 'ripples',
    name: 'Ripples',
    line: 'Tap a koi pond and watch each ripple spread and fade, like a passing thought.',
    how: 'as long as you like',
    bg: 'radial-gradient(120% 120% at 50% 40%, #14294b, #09142a)',
    art: <Ascii lines={POND} paint={(ch) => ("><()'".includes(ch) ? '#f0a07c' : ch === '%' ? '#6f9f78' : '*@'.includes(ch) ? '#e6a6b8' : 'oO:'.includes(ch) ? '#d2e6f7' : '#41709e')} />,
  },
  {
    id: 'garden',
    name: 'Zen garden',
    line: 'Rake slow lines into sand and set stones with rings around them.',
    how: 'as long as you like',
    bg: 'linear-gradient(#f1e9d8, #e5d9c1)',
    art: <Ascii lines={SAND} paint={(ch, r, c) => ('@()'.includes(ch) ? '#5f5a52' : ".-'".includes(ch) && r >= 3 && r <= 5 && c > 10 && c < 16 ? '#8b857a' : '#a8977a')} />,
  },
]

export default function Play() {
  const [game, setGame] = useState<Game | null>(null)
  return (
    <>
      <Screen title={<>Calm <span className="display-i text-accent">play</span></>} kicker="Stress relief">
        <p className="max-w-md text-ink-soft">Small, slow games with no score, no timer and no way to lose. Repeating one gentle action gives a busy mind something soft to hold.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {GAMES.map((g, i) => (
            <motion.button
              key={g.id}
              onClick={() => setGame(g.id)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.98 }}
              className="card group overflow-hidden rounded-[28px] p-0 text-left"
            >
              <div className="relative grid h-36 place-items-center overflow-hidden" style={{ background: g.bg }}>
                <div className="transition-transform duration-[1.6s] ease-[var(--ease-calm)] group-hover:scale-105">{g.art}</div>
              </div>
              <div className="flex items-end justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="display text-xl">{g.name}</p>
                  <p className="mt-1 text-sm text-ink-soft">{g.line}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">{g.how}</p>
                </div>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--btn)] text-[var(--btn-ink)]" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                </span>
              </div>
            </motion.button>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-ink-faint">Sound is soft and optional. Each game has a speaker button.</p>
      </Screen>
      <AnimatePresence>
        {game === 'sea' && <CalmSea key="sea" replay onDone={() => setGame(null)} />}
        {game === 'ripples' && <Ripples key="ripples" onClose={() => setGame(null)} />}
        {game === 'garden' && <ZenGarden key="garden" onClose={() => setGame(null)} />}
      </AnimatePresence>
    </>
  )
}
