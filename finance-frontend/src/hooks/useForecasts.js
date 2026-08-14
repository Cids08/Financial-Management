import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

export function useForecasts() {
  const [forecasts, setForecasts] = useState([])
  const [forecastsLoading, setForecastsLoading] = useState(true)
  const [forecastsError, setForecastsError] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const fetchForecasts = useCallback(async () => {
    setForecastsLoading(true)
    setForecastsError(null)
    try {
      const res = await apiFetch('/api/forecasts')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load forecasts.')
      setForecasts(json.data)
    } catch (err) {
      setForecastsError(err.message)
    } finally {
      setForecastsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchForecasts()
  }, [fetchForecasts])

  /**
   * Generates AND persists in one call — the backend has no separate
   * preview/confirm step. The returned forecast already includes `series`
   * (FinancialForecastDetailResource), so the modal's result view can
   * render the chart straight from this response.
   */
  const generateForecast = useCallback(async (forecastType, horizonKey) => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await apiFetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forecast_type: forecastType, horizon_key: horizonKey }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to generate forecast.')
      await fetchForecasts()
      return { success: true, forecast: json.data }
    } catch (err) {
      setGenerateError(err.message)
      return { success: false, message: err.message }
    } finally {
      setGenerating(false)
    }
  }, [fetchForecasts])

  /**
   * The list endpoint omits `series` (perf — see FinancialForecastResource),
   * so the detail modal fetches it fresh on open. Note: the mock engine
   * recomputes series with fresh random noise on every call, so re-opening
   * the same forecast's detail can show a slightly different chart until
   * the real ARIMA service (deterministic against real data) replaces it.
   */
  const fetchForecastDetail = useCallback(async (forecastId) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await apiFetch(`/api/forecasts/${forecastId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load forecast detail.')
      return { success: true, forecast: json.data }
    } catch (err) {
      setDetailError(err.message)
      return { success: false, message: err.message }
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return {
    forecasts,
    forecastsLoading,
    forecastsError,
    generating,
    generateError,
    detailLoading,
    detailError,
    generateForecast,
    fetchForecastDetail,
    refetch: fetchForecasts,
  }
}