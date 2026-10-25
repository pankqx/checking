import { useEffect, useState } from 'react'

export type Route =
  | 'home' | 'checkin' | 'insights' | 'thoughts' | 'meditation' | 'release'
  | 'body' | 'companion' | 'planner' | 'pendant' | 'you' | 'play'

const read = (): Route => (location.hash.replace('#/', '') || 'home') as Route

export function useRoute() {
  const [r, setR] = useState<Route>(read)
  useEffect(() => {
    const f = () => setR(read())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return r
}

// The page scrolls to the top once the old screen has faded out (see App), so
// the move between screens never jumps.
export const go = (r: Route) => {
  location.hash = `#/${r}`
}
