import { useState, useEffect, useMemo } from 'react'
import { MapPin, Globe, ChevronDown, Check, Edit3 } from 'lucide-react'
import { PH_REGIONS, POPULAR_COUNTRIES } from '../data/philippineAddresses'

/**
 * User-Friendly Address Selector Component
 * 
 * Supports:
 * 1. Philippine standard address (Cascading dropdowns: Region -> Province -> City/Municipality + Street)
 * 2. International address (Country dropdown + City/State/ZIP + Street line)
 * 3. Freeform text mode (Direct single-line typing for custom/legacy formats)
 * 
 * Always outputs a single string formatted cleanly to `onChange(fullAddress)`
 */
export default function AddressSelector({
  value = '',
  onChange,
  label = 'Address',
  placeholder = 'Select address or type...',
  disabled = false,
  required = false,
  error = '',
}) {
  // Mode: 'ph' (Philippines Dropdowns) | 'intl' (International) | 'freeform' (Manual Text)
  const [mode, setMode] = useState('ph')

  // Philippine selection state
  const [selectedRegionId, setSelectedRegionId] = useState('')
  const [selectedProvinceName, setSelectedProvinceName] = useState('')
  const [selectedCityName, setSelectedCityName] = useState('')
  const [barangayOrDistrict, setBarangayOrDistrict] = useState('')
  const [streetLine, setStreetLine] = useState('')
  const [zipCode, setZipCode] = useState('')

  // International selection state
  const [intlCountry, setIntlCountry] = useState('')
  const [intlStateCity, setIntlStateCity] = useState('')
  const [intlStreet, setIntlStreet] = useState('')
  const [intlZip, setIntlZip] = useState('')

  // Freeform text state
  const [freeformText, setFreeformText] = useState(value || '')

  // Available provinces based on chosen region
  const availableProvinces = useMemo(() => {
    if (!selectedRegionId) return []
    const reg = PH_REGIONS.find((r) => r.id === selectedRegionId)
    return reg ? reg.provinces : []
  }, [selectedRegionId])

  // Available cities based on chosen province
  const availableCities = useMemo(() => {
    if (!selectedProvinceName || !availableProvinces.length) return []
    const prov = availableProvinces.find((p) => p.name === selectedProvinceName)
    return prov ? prov.cities : []
  }, [selectedProvinceName, availableProvinces])

  // Sync incoming value to freeform state if value changes externally
  useEffect(() => {
    if (value !== undefined) {
      setFreeformText(value || '')
    }
  }, [value])

  // Emit formatted address when PH components change
  const handlePhChange = (updates) => {
    const next = {
      regionId: selectedRegionId,
      province: selectedProvinceName,
      city: selectedCityName,
      brgy: barangayOrDistrict,
      street: streetLine,
      zip: zipCode,
      ...updates,
    }

    // Build assembled address string
    const parts = []
    if (next.street.trim()) parts.push(next.street.trim())
    if (next.brgy.trim()) parts.push(next.brgy.trim().startsWith('Brgy') ? next.brgy.trim() : `Brgy. ${next.brgy.trim()}`)
    if (next.city) parts.push(next.city)
    if (next.province) parts.push(next.province)
    if (next.zip.trim()) parts.push(next.zip.trim())

    const fullStr = parts.join(', ')
    onChange(fullStr)
  }

  // Emit formatted address when International components change
  const handleIntlChange = (updates) => {
    const next = {
      country: intlCountry,
      stateCity: intlStateCity,
      street: intlStreet,
      zip: intlZip,
      ...updates,
    }

    const parts = []
    if (next.street.trim()) parts.push(next.street.trim())
    if (next.stateCity.trim()) parts.push(next.stateCity.trim())
    if (next.zip.trim()) parts.push(next.zip.trim())
    if (next.country) parts.push(next.country)

    const fullStr = parts.join(', ')
    onChange(fullStr)
  }

  // Tailwind input styles matching project design system
  const SELECT_STYLE = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150`
  const INPUT_STYLE = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
    placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150`
  const SUB_LABEL = 'block text-[11px] font-medium text-muted mb-1'

  return (
    <div className="space-y-2">
      {/* Header with Title & Mode Switchers */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-muted">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('ph')}
            className={`px-2 py-1 rounded-md font-medium transition-all ${
              mode === 'ph'
                ? 'bg-primary/20 text-primary-dark font-semibold'
                : 'text-muted hover:text-ink'
            }`}
          >
            🇵🇭 Philippines
          </button>
          <button
            type="button"
            onClick={() => setMode('intl')}
            className={`px-2 py-1 rounded-md font-medium transition-all ${
              mode === 'intl'
                ? 'bg-primary/20 text-primary-dark font-semibold'
                : 'text-muted hover:text-ink'
            }`}
          >
            🌐 International
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('freeform')
              setFreeformText(value || '')
            }}
            className={`px-2 py-1 rounded-md font-medium transition-all ${
              mode === 'freeform'
                ? 'bg-primary/20 text-primary-dark font-semibold'
                : 'text-muted hover:text-ink'
            }`}
            title="Type custom address without dropdowns"
          >
            <Edit3 size={11} className="inline mr-1" />
            Freeform
          </button>
        </div>
      </div>

      {/* Mode 1: Philippines Cascading Dropdowns */}
      {mode === 'ph' && (
        <div className="rounded-xl border border-border bg-surface/50 p-3 space-y-2.5">
          {/* Region */}
          <div>
            <label className={SUB_LABEL}>Region</label>
            <select
              disabled={disabled}
              value={selectedRegionId}
              onChange={(e) => {
                const regId = e.target.value
                setSelectedRegionId(regId)
                setSelectedProvinceName('')
                setSelectedCityName('')
                handlePhChange({ regionId: regId, province: '', city: '' })
              }}
              className={SELECT_STYLE}
            >
              <option value="">-- Select Region --</option>
              {PH_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Province & City in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={SUB_LABEL}>Province / District</label>
              <select
                disabled={disabled || !selectedRegionId}
                value={selectedProvinceName}
                onChange={(e) => {
                  const prov = e.target.value
                  setSelectedProvinceName(prov)
                  setSelectedCityName('')
                  handlePhChange({ province: prov, city: '' })
                }}
                className={SELECT_STYLE}
              >
                <option value="">
                  {!selectedRegionId ? 'Select a Region first' : '-- Select Province --'}
                </option>
                {availableProvinces.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={SUB_LABEL}>City / Municipality</label>
              <select
                disabled={disabled || !selectedProvinceName}
                value={selectedCityName}
                onChange={(e) => {
                  const city = e.target.value
                  setSelectedCityName(city)
                  handlePhChange({ city })
                }}
                className={SELECT_STYLE}
              >
                <option value="">
                  {!selectedProvinceName ? 'Select Province first' : '-- Select City/Municipality --'}
                </option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Barangay & ZIP Code in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={SUB_LABEL}>Barangay / District (Optional)</label>
              <input
                type="text"
                disabled={disabled}
                value={barangayOrDistrict}
                onChange={(e) => {
                  const val = e.target.value
                  setBarangayOrDistrict(val)
                  handlePhChange({ brgy: val })
                }}
                placeholder="e.g. San Antonio"
                className={INPUT_STYLE}
              />
            </div>
            <div>
              <label className={SUB_LABEL}>ZIP Code (Optional)</label>
              <input
                type="text"
                disabled={disabled}
                value={zipCode}
                onChange={(e) => {
                  const val = e.target.value
                  setZipCode(val)
                  handlePhChange({ zip: val })
                }}
                placeholder="e.g. 1600"
                className={INPUT_STYLE}
              />
            </div>
          </div>

          {/* Street / Building / House Number */}
          <div>
            <label className={SUB_LABEL}>Street Address / Building / Unit No.</label>
            <input
              type="text"
              disabled={disabled}
              value={streetLine}
              onChange={(e) => {
                const val = e.target.value
                setStreetLine(val)
                handlePhChange({ street: val })
              }}
              placeholder="e.g. Unit 402 Emerald Tower, F. Ortigas Jr. Rd."
              className={INPUT_STYLE}
            />
          </div>
        </div>
      )}

      {/* Mode 2: International Address */}
      {mode === 'intl' && (
        <div className="rounded-xl border border-border bg-surface/50 p-3 space-y-2.5">
          <div>
            <label className={SUB_LABEL}>Country</label>
            <select
              disabled={disabled}
              value={intlCountry}
              onChange={(e) => {
                const c = e.target.value
                setIntlCountry(c)
                handleIntlChange({ country: c })
              }}
              className={SELECT_STYLE}
            >
              <option value="">-- Select Country --</option>
              {POPULAR_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={SUB_LABEL}>City / State / Region</label>
              <input
                type="text"
                disabled={disabled}
                value={intlStateCity}
                onChange={(e) => {
                  const val = e.target.value
                  setIntlStateCity(val)
                  handleIntlChange({ stateCity: val })
                }}
                placeholder="e.g. Los Angeles, CA or Tokyo"
                className={INPUT_STYLE}
              />
            </div>
            <div>
              <label className={SUB_LABEL}>Postal / ZIP Code</label>
              <input
                type="text"
                disabled={disabled}
                value={intlZip}
                onChange={(e) => {
                  const val = e.target.value
                  setIntlZip(val)
                  handleIntlChange({ zip: val })
                }}
                placeholder="e.g. 90001"
                className={INPUT_STYLE}
              />
            </div>
          </div>

          <div>
            <label className={SUB_LABEL}>Street Address / Suite / Building</label>
            <input
              type="text"
              disabled={disabled}
              value={intlStreet}
              onChange={(e) => {
                const val = e.target.value
                setIntlStreet(val)
                handleIntlChange({ street: val })
              }}
              placeholder="e.g. 450 North Brand Blvd, Suite 600"
              className={INPUT_STYLE}
            />
          </div>
        </div>
      )}

      {/* Mode 3: Freeform Text */}
      {mode === 'freeform' && (
        <div className="relative">
          <input
            type="text"
            disabled={disabled}
            value={freeformText}
            onChange={(e) => {
              const val = e.target.value
              setFreeformText(val)
              onChange(val)
            }}
            placeholder={placeholder}
            className={`${INPUT_STYLE} pl-8`}
          />
          <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      )}

      {/* Preview of assembled result */}
      {value && mode !== 'freeform' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg border border-border/80 text-xs">
          <MapPin size={13} className="text-primary-dark shrink-0" />
          <span className="text-muted shrink-0 text-[11px]">Formatted:</span>
          <span className="text-ink font-medium truncate">{value}</span>
        </div>
      )}

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

