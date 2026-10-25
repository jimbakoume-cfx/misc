import { useEffect, useState } from 'react'

// "Moat" feature #3 — resilience on unreliable networks. Every Suivix action already
// writes straight to local storage, so the app keeps working through drops in
// connectivity; this hook just surfaces that state so users can see it plainly.
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
