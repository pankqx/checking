import type { Level } from './analysis'

// How each signal level looks. "Strained" is shown as "needs care" in a soft
// coral: honest, but never an alarm.
export const LEVEL_STYLE: Record<Level, { label: string; color: string; ink: string; fill: number }> = {
  steady: { label: 'steady', color: 'var(--pista)', ink: 'var(--steady-ink)', fill: 0.25 },
  shifting: { label: 'shifting', color: 'var(--haldi)', ink: 'var(--shift-ink)', fill: 0.6 },
  strained: { label: 'needs care', color: 'var(--care)', ink: 'var(--care-ink)', fill: 1 },
  unknown: { label: 'learning', color: 'var(--line)', ink: 'var(--ink-faint)', fill: 0.1 },
}
