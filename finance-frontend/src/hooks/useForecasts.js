import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

export function useForecasts() {
  const [forecasts, setForecasts] = useState([])
  const [forecastsLoading, setForecastsLoading] = useState(true)
  const [forecastsError, setForecastsError] = useState(null)

  // Toggles between the active list (default) and the archived list —
  // drives the `status` query param the backend uses to switch between
  // FinancialForecast::query() and ::onlyTrashed(). Kept in the hook
  // (not the page) since it's API-fetch state, not UI-only state.
  const [showArchived, setShowArchived] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState(null)

  const fetchForecasts = useCallback(async (archived = showArchived) => {
    setForecastsLoading(true)
    setForecastsError(null)
    try {
      const res = await apiFetch(`/api/forecasts${archived ? '?status=archived' : ''}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load forecasts.')
      setForecasts(json.data)
    } catch (err) {
      setForecastsError(err.message)
    } finally {
      setForecastsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

  useEffect(() => {
    fetchForecasts(showArchived)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

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

  /** Soft-deletes (archives) a forecast, then refreshes the current view. */
  const archiveForecast = useCallback(async (forecastId) => {
    setArchiving(true)
    setArchiveError(null)
    try {
      const res = await apiFetch(`/api/forecasts/${forecastId}/archive`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive forecast.')
      await fetchForecasts()
      return { success: true }
    } catch (err) {
      setArchiveError(err.message)
      return { success: false, message: err.message }
    } finally {
      setArchiving(false)
    }
  }, [fetchForecasts])

  /** Restores a previously archived forecast, then refreshes the current view. */
  const restoreForecast = useCallback(async (forecastId) => {
    setArchiving(true)
    setArchiveError(null)
    try {
      const res = await apiFetch(`/api/forecasts/${forecastId}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore forecast.')
      await fetchForecasts()
      return { success: true }
    } catch (err) {
      setArchiveError(err.message)
      return { success: false, message: err.message }
    } finally {
      setArchiving(false)
    }
  }, [fetchForecasts])

  return {
    forecasts,
    forecastsLoading,
    forecastsError,
    showArchived,
    setShowArchived,
    generating,
    generateError,
    detailLoading,
    detailError,
    archiving,
    archiveError,
    generateForecast,
    fetchForecastDetail,
    archiveForecast,
    restoreForecast,
    refetch: fetchForecasts,
  }
}