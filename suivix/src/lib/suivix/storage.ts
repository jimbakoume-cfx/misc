import { useState, useEffect, useCallback } from 'react'

const PREFIX = 'suivix:'

/**
 * Generic localStorage-backed state. Reads the seed value once on mount if
 * nothing is stored yet, then persists every update automatically.
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (updater: T | ((prev: T) => T)) => void] {
  const fullKey = `${PREFIX}${key}`

  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(fullKey)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      // fall through to seed value
    }
    return initialValue instanceof Function ? initialValue() : initialValue
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(state))
    } catch {
      // storage full or unavailable — ignore, app still works in-memory
    }
  }, [fullKey, state])

  const setPersisted = useCallback((updater: T | ((prev: T) => T)) => {
    setState((prev) => (updater instanceof Function ? updater(prev) : updater))
  }, [])

  return [state, setPersisted]
}

export function resetAllSuivixData() {
  const keysToRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(PREFIX)) keysToRemove.push(k)
  }
  keysToRemove.forEach((k) => window.localStorage.removeItem(k))
}
