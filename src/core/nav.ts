import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * "Back" that returns to where you actually came from (e.g. your track, the
 * people list with its filter) and only falls back to a fixed page when the
 * screen was opened directly from a link or a fresh tab.
 * React Router keeps an index of in-app history entries in history.state.idx.
 */
export function useBack() {
  const nav = useNavigate()
  return useCallback((fallback: string) => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1)
    else nav(fallback, { replace: true })
  }, [nav])
}
