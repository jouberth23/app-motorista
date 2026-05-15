import { useState, useEffect, useCallback } from 'react'

interface QueueItem {
  id: string
  type: 'trip_draft'
  data: unknown
  timestamp: number
}

const STORAGE_KEY = 'taxivoucher_offline_queue'
const DRAFTS_KEY = 'taxivoucher_drafts'

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setQueue(JSON.parse(saved))
      } catch {
        // ignore
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const saveDraftLocally = useCallback((id: string, data: unknown) => {
    const drafts = getDrafts()
    drafts[id] = { data, savedAt: Date.now() }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  }, [])

  const getDraftLocally = useCallback((id: string) => {
    const drafts = getDrafts()
    return drafts[id]?.data ?? null
  }, [])

  const removeDraftLocally = useCallback((id: string) => {
    const drafts = getDrafts()
    delete drafts[id]
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  }, [])

  const getAllDrafts = useCallback(() => {
    return getDrafts()
  }, [])

  return {
    isOnline,
    queue,
    saveDraftLocally,
    getDraftLocally,
    removeDraftLocally,
    getAllDrafts,
    pendingCount: queue.length,
  }
}

function getDrafts(): Record<string, { data: unknown; savedAt: number }> {
  const saved = localStorage.getItem(DRAFTS_KEY)
  if (!saved) return {}
  try {
    return JSON.parse(saved)
  } catch {
    return {}
  }
}
