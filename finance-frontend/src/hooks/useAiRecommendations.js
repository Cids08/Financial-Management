import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

export function useAiRecommendations() {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRecommendations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/ai-recommendations')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load recommendations.')
      setRecommendations(json.data)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Both archive/restore patch the single recommendation returned by the
  // backend into local state in place, rather than refetching the whole
  // list — same trade-off every other module's hooks in this app make,
  // keeps the UI snappy and avoids losing scroll position / filters.
  const archiveRecommendation = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/ai-recommendations/${id}/archive`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive recommendation.')
      setRecommendations((prev) => prev.map((r) => (r.recommendation_id === id ? json.data : r)))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const restoreRecommendation = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/ai-recommendations/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore recommendation.')
      setRecommendations((prev) => prev.map((r) => (r.recommendation_id === id ? json.data : r)))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  return {
    recommendations,
    loading,
    error,
    fetchRecommendations,
    archiveRecommendation,
    restoreRecommendation,
  }
}