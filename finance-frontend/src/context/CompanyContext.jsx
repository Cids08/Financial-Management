import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api'
import { setActiveConversion } from '../utils/formatters'

const CompanyContext = createContext(null)

/**
 * Wrap App (or DashboardLayout) with this once. Sidebar, Settings, and any
 * other consumer of useCompany() then share the same fetch/state  -  same
 * pattern as ProfileContext  -  instead of each screen holding its own copy
 * of company branding.
 *
 * Backed by GET/PUT /api/settings and POST/DELETE /api/settings/logo.
 *
 * NOTE: the `settings` table has several columns the old local-only
 * CompanyContext never exposed (company_address, company_email,
 * company_phone, currency, base_currency, exchange_rates, fiscal_year,
 * default_tax_rate, default_penalty_rate, forecast_months). They're
 * included here so Settings.jsx can surface and edit them.
 */
export function CompanyProvider({ children }) {
  const [company, setCompany] = useState({
    name: 'FMS',
    tagline: '',
    address: '',
    email: '',
    phone: '',
    tin: '',
    logoUrl: null,
    currency: 'PHP',
    baseCurrency: 'PHP',
    exchangeRates: {},
    fiscalYear: new Date().getFullYear(),
    defaultTaxRate: 0,
    defaultPenaltyRate: 0,
    forecastMonths: 12,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchCompany = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/settings')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load settings.')
      setCompany((c) => ({ ...c, ...json.data }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  // Keep the app-wide currency formatter in sync with the Settings values so
  // switching Peso <-> Dollar (plus the base currency + exchange rates) both
  // relabels AND converts amounts everywhere, not just here.
  useEffect(() => {
    setActiveConversion({
      currency: company.currency,
      baseCurrency: company.baseCurrency,
      exchangeRates: company.exchangeRates,
    })
  }, [company.currency, company.baseCurrency, company.exchangeRates])

  /**
   * fields: { name, tagline, address, email, phone, currency, fiscalYear,
   * defaultTaxRate, forecastMonths }  -  send only what changed, the backend
   * currently persists name/tagline via this endpoint (see note below).
   */
  const updateBranding = useCallback(async (fields) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update settings.')
      setCompany((c) => ({ ...c, ...json.data }))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const uploadLogo = useCallback(async (file) => {
    setError(null)
    const formData = new FormData()
    formData.append('logo', file)
    try {
      const res = await apiFetch('/api/settings/logo', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to upload logo.')
      setCompany((c) => ({ ...c, ...json.data }))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const removeLogo = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch('/api/settings/logo', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to remove logo.')
      setCompany((c) => ({ ...c, ...json.data }))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const value = {
    ...company,
    loading,
    saving,
    error,
    updateBranding,
    uploadLogo,
    removeLogo,
    refetch: fetchCompany,
  }

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) {
    throw new Error('useCompany must be used within a <CompanyProvider>')
  }
  return ctx
}