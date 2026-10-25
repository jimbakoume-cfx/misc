import { useEffect, useRef } from 'react'
import { useConnectivity } from '../../hooks/useConnectivity'
import { toast } from '../../lib/shadcn/sonner'

// No visible status in the UI: only tell the user when the connection drops or comes back.
export function ConnectivityWatcher() {
  const online = useConnectivity()
  const everOffline = useRef(false)

  useEffect(() => {
    if (!online) {
      everOffline.current = true
      toast.warning('Connexion perdue — Suivix continue de fonctionner en local, tout sera synchronisé au retour du réseau.')
    } else if (everOffline.current) {
      toast.success('Connexion rétablie — données synchronisées.')
    }
  }, [online])

  return null
}
