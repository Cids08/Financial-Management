import { useState, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

const ENDPOINTS = {
  'income-statement': { path: '/api/reports/income-statement', usesPeriod: true },
  'cash-flow': { path: '/api/reports/cash-flow', usesPeriod: true },
  'ar-aging': { path: '/api/reports/ar-aging', usesPeriod: false },
  'ap-aging': { path: '/api/reports/ap-aging', usesPeriod: false },
  'budget-vs-actual': { path: '/api/reports/budget-vs-actual', usesPeriod: true },
}

const EMPTY_DEFAULTS = {
  'income-statement': { revenue: [], expenses: [] },
  'cash-flow': [],
  'ar-aging': [],
  'ap-aging': [],
  'budget-vs-actual': [],
}

/**
 * Backs Reports.jsx against /api/reports/*. Each report type is fetched
 * independently and cached against the period it was fetched with — AR
 * and AP aging ignore the period entirely (aging is always "as of
 * today"), so those two are only ever fetched once and never refetched
 * on a period change, unlike the other three.
 */
export function useReports() {
  const [data, setData] = useState({ ...EMPTY_DEFAULTS })
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

  // Tracks which period each report's currently-cached data was fetched
  // with, so switching period only refetches the reports that actually
  // depend on it, and switching tabs never refetches data already in hand.
  const cachedPeriod = useRef({})

  const fetchReport = useCallback(async (reportKey, period) => {
    const config = ENDPOINTS[reportKey]
    const cacheKey = config.usesPeriod ? period : '__static__'

    if (cachedPeriod.current[reportKey] === cacheKey) {
      return // already have this exact (report, period) combination
    }

    setLoading((prev) => ({ ...prev, [reportKey]: true }))
    setError(null)
    try {
      const params = config.usesPeriod ? `?period=${encodeURIComponent(period)}` : ''
      const res = await apiFetch(`${config.path}${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || `Failed to load ${reportKey}.`)

      setData((prev) => ({ ...prev, [reportKey]: json.data }))
      cachedPeriod.current[reportKey] = cacheKey
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading((prev) => ({ ...prev, [reportKey]: false }))
    }
  }, [])

  // Ensures every report type is loaded for the given period — used by
  // "Export All", which needs all five regardless of which tab is active.
  const fetchAll = useCallback(async (period) => {
    await Promise.all(Object.keys(ENDPOINTS).map((key) => fetchReport(key, period)))
  }, [fetchReport])

  return { data, loading, error, fetchReport, fetchAll }
}