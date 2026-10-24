import { motion } from 'framer-motion'

// The "mirror": a breathing ink blob whose colour and shape follow the mood.
// Mood 1 = heavy indigo, 3 = haldi, 5 = sindoor sunrise.

const PALETTE = ['var(--neel)', 'var(--neel)', 'var(--pista)', 'var(--haldi)', 'var(--gulabi)', 'var(--sindoor)']

const BLOBS = [
  'M60,-58C76,-42,86,-21,85,0C84,20,72,41,55,56C38,71,19,80,-2,82C-23,84,-46,79,-62,64C-78,49,-87,25,-86,1C-85,-22,-74,-44,-58,-60C-42,-76,-21,-86,0,-86C21,-86,44,-74,60,-58Z',
  'M57,-61C71,-44,78,-22,80,2C82,26,79,52,64,67C49,82,24,86,-1,87C-26,88,-52,85,-66,70C-80,55,-82,28,-80,2C-78,-24,-72,-48,-57,-65C-42,-82,-21,-92,0,-92C21,-92,43,-78,57,-61Z',
  'M63,-63C79,-47,87,-23,86,-1C85,21,75,42,59,56C43,70,22,77,-2,79C-26,81,-52,78,-67,64C-82,50,-86,25,-84,2C-82,-21,-74,-42,-59,-58C-44,-74,-22,-85,1,-86C24,-87,47,-79,63,-63Z',
]

export function Orb({ mood = 3, size = 220, face = true, speed = 1 }: { mood?: number; size?: number; face?: boolean; speed?: number }) {
  const m = Math.max(1, Math.min(5, Math.round(mood)))
  const color = PALETTE[m]
  const mouth = ['M-14,22 Q0,10 14,22', 'M-14,20 Q0,14 14,20', 'M-14,18 L14,18', 'M-14,16 Q0,24 14,16', 'M-16,14 Q0,30 16,14'][m - 1]
  return (
    <motion.svg
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      animate={{ scale: [1, 1.045, 1] }}
      transition={{ duration: 5.5 / speed, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    >
      <defs>
        <radialGradient id={`og${m}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.7" />
          <stop offset="45%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} />
        </radialGradient>
      </defs>
      <motion.path
        fill={color}
        opacity={0.25}
        animate={{ d: [BLOBS[1], BLOBS[2], BLOBS[0], BLOBS[1]] }}
        transition={{ duration: 14 / speed, repeat: Infinity, ease: 'easeInOut' }}
        transform="scale(1.12)"
      />
      <motion.path
        fill={`url(#og${m})`}
        animate={{ d: [BLOBS[0], BLOBS[1], BLOBS[2], BLOBS[0]] }}
        transition={{ duration: 11 / speed, repeat: Infinity, ease: 'easeInOut' }}
      />
      <path d={BLOBS[0]} fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity="0.5" transform="scale(1.02) rotate(8)" strokeDasharray="2 5" />
      {face && (
        <g stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" fill="none">
          <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 6, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1] }}>
            <line x1="-20" y1="-8" x2="-20" y2="0" />
            <line x1="20" y1="-8" x2="20" y2="0" />
          </motion.g>
          <path d={mouth} />
        </g>
      )}
    </motion.svg>
  )
}
