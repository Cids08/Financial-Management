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

  return { recommendations, loading, error, fetchRecommendations }
}