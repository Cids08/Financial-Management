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
 * independently and cached against the period it was fetched with  -  AR
 * and AP aging ignore the period entirely (aging is always "as of
 * today"), so those two are only ever fetched once and never refetched
 * on a period change, unlike the other three.
 */
function buildQuery(config, filterParams) {
  if (!config.usesPeriod) return ''
  if (!filterParams) return ''
  if (typeof filterParams === 'string') {
    return `?period=${encodeURIComponent(filterParams)}`
  }
  const params = new URLSearchParams()
  if (filterParams.startDate && filterParams.endDate) {
    params.set('start_date', filterParams.startDate)
    params.set('end_date', filterParams.endDate)
  } else if (filterParams.period) {
    params.set('period', filterParams.period)
  }
  if (filterParams.compare) {
    params.set('compare', '1')
    if (filterParams.compareMode) {
      params.set('compare_mode', filterParams.compareMode)
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function getCacheKey(config, filterParams) {
  if (!config.usesPeriod) return '__static__'
  if (!filterParams) return '__empty__'
  if (typeof filterParams === 'string') return filterParams
  return JSON.stringify(filterParams)
}

export function useReports() {
  const [data, setData] = useState({ ...EMPTY_DEFAULTS })
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

  const cachedPeriod = useRef({})

  const fetchReport = useCallback(async (reportKey, filterParams) => {
    const config = ENDPOINTS[reportKey]
    const cacheKey = getCacheKey(config, filterParams)

    if (cachedPeriod.current[reportKey] === cacheKey) {
      return // already have this exact cached data
    }

    setLoading((prev) => ({ ...prev, [reportKey]: true }))
    setError(null)
    try {
      const qs = buildQuery(config, filterParams)
      const res = await apiFetch(`${config.path}${qs}`)
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

  // Ensures every report type is loaded for the given filter parameters
  const fetchAll = useCallback(async (filterParams) => {
    await Promise.all(Object.keys(ENDPOINTS).map((key) => fetchReport(key, filterParams)))
  }, [fetchReport])

  return { data, loading, error, fetchReport, fetchAll }
}