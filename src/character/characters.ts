// Companion characters. The ink designs come from Pankaj's pank-os project
// (src/character/InkCharacter.tsx there); here they become MindMirror's
// two companions, with their own voice and way of talking.

export type CharacterId = 'reenu' | 'roman'
export type CharState = 'IDLE' | 'GREETING' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'REACTING' | 'ERROR'
export type Expression = 'neutral' | 'happy' | 'concerned' | 'calm' | 'surprised'

export interface CharacterConfig {
  id: CharacterId
  name: string
  tagline: string
  accent: string
  voice: { lang: string; pitch: number; rate: number; preferNames: string[] }
  openers: string[]
  cheer: string[]
  comfort: string[]
}

export const characters: Record<CharacterId, CharacterConfig> = {
  reenu: {
    id: 'reenu',
    name: 'Reenu',
    tagline: 'warm · curious · asks the second question',
    accent: '#ff5d73',
    voice: { lang: 'en-IN', pitch: 1.12, rate: 1.0, preferNames: ['Veena', 'Heera', 'Google हिन्दी', 'Google UK English Female', 'Samantha', 'Female'] },
    openers: ['Ooh,', 'Okay,', 'Hmm,', 'Listen,'],
    cheer: ['Yesss! That’s the spirit.', 'Look at you go!', 'Okay that was satisfying, right?', 'I’m so proud of you, honestly.'],
    comfort: ['That sounds heavy. I’m right here.', 'Thank you for telling me. We’ll go slow.', 'Hey, it’s okay to have days like this.'],
  },
  roman: {
    id: 'roman',
    name: 'Roman',
    tagline: 'calm · dry wit · keeps it short',
    accent: '#7c8cff',
    voice: { lang: 'en-IN', pitch: 0.9, rate: 1.0, preferNames: ['Ravi', 'Rishi', 'Google UK English Male', 'Daniel', 'Male'] },
    openers: ['Right.', 'Short version:', 'Noted.', 'Okay.'],
    cheer: ['Solid work.', 'Respect. That counts.', 'See? Lighter already.', 'Ten out of ten, no notes.'],
    comfort: ['Rough one. I’m here.', 'Heard. Let’s take it one step at a time.', 'That’s a lot. You don’t have to fix it tonight.'],
  },
}

export const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
