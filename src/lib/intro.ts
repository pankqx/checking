// The opening "Calm the sea" moment: once per visit, unless turned off in You.

const PREF = 'mm-intro'
const SEEN = 'mm-intro-seen'

export const introWanted = () => { try { return localStorage.getItem(PREF) !== 'off' } catch { return true } }
export const setIntroWanted = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* private mode */ } }
export const introSeen = () => { try { return sessionStorage.getItem(SEEN) === '1' } catch { return false } }
export const markIntroSeen = () => { try { sessionStorage.setItem(SEEN, '1') } catch { /* private mode */ } }
