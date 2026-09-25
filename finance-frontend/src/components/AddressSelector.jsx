import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, MapPin, X, Navigation, Globe } from 'lucide-react'
import { GOOGLE_PLACES_INDEX, ALL_COUNTRIES_LIST } from '../data/googlePlacesIndex'
import { apiFetch } from '../utils/api'

// Street-aware searchable text: description + street route + postal code.
const isSearchableTextHit = (item, q) => {
  const a = item.address_components || {}
  return `${item.description} ${a.route || ''} ${a.postal_code || ''}`.toLowerCase().includes(q)
}

/**
 * 3-Step Perfected Google Places Address Form
 * 
 * 1. Search Ordering:
 *    - Main search bar is placed at the very top, labeled "Search for Address".
 *    - The secondary manual field is strictly for "Apt, Suite, Unit, or Floor No. (Optional)".
 * 
 * 2. Separate "Street Address" from "Unit":
 *    - The Google Places parser auto-injects the parsed street/route into a dedicated "Street Address" field!
 *    - The user only has to type their specific unit/floor number if applicable.
 * 
 * 3. Open "Country" Dropdown Selection:
 *    - Positioned with full flexibility so international or cross-border accounts can pick any country immediately.
 * 
 * 4. Keyboard Shortcuts:
 *    - Down Arrow (↓) moves into suggestions.
 *    - Enter (↵) selects and auto-shifts cursor focus straight to "Apt, Suite, Unit, or Floor No.".
 */
export default function AddressSelector({
  value = '',
  onChange,
  disabled = false,
  required = false,
  error = '',
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  // Separated Address Components
  const [unitFloor, setUnitFloor] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [locality, setLocality] = useState('')
  const [adminArea, setAdminArea] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('Philippines') // Open dropdown, defaults to Philippines

  const searchInputRef = useRef(null)
  const unitInputRef = useRef(null)
  const containerRef = useRef(null)

  // Initialize from existing address if editing
  useEffect(() => {
    if (value && !streetAddress && !unitFloor && !locality) {
      setStreetAddress(value)
    }
  }, [value, streetAddress, unitFloor, locality])

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Remote (OpenStreetMap/Nominatim) street hits — the "any street" fallback
  // fetched from the backend once the static index has no street match.
  const [remoteResults, setRemoteResults] = useState([])

  // Debounced free-geocoder lookup. Skipped whenever the static index already
  // matches, so common queries never touch the network.
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    const localHit = q && GOOGLE_PLACES_INDEX.some((item) => isSearchableTextHit(item, q))

    if (q.length < 3 || localHit) {
      setRemoteResults([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/geocode?q=${encodeURIComponent(searchQuery.trim())}`, {
          timeoutMs: 7000,
        })
        if (cancelled) return
        const data = Array.isArray(res?.data) ? res.data : []
        setRemoteResults(data.filter((d) => d && d.description))
      } catch {
        if (!cancelled) setRemoteResults([])
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  // Filter Google Places suggestions
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const byQuery = GOOGLE_PLACES_INDEX.filter((item) => isSearchableTextHit(item, q))

    // Any matched static entry wins. Otherwise fall back to the live street
    // geocoder first (keeps "Panay Avenue" etc. street-accurate), then to a
    // city-name anchor only if that too comes up empty.
    let matched
    if (byQuery.length) {
      matched = byQuery
    } else {
      const seen = new Set(GOOGLE_PLACES_INDEX.map((item) => item.description.toLowerCase()))
      const remote = remoteResults.filter((place) => !seen.has(place.description.toLowerCase()))
      matched = remote.length ? remote : []
      if (!matched.length) {
        matched = GOOGLE_PLACES_INDEX.map((item) => ({ item, a: item.address_components || {} }))
          .filter(({ a }) => {
            const name = (a.locality || '').toLowerCase()
            const area = (a.administrative_area_level_1 || '').toLowerCase()
            return (name && q.includes(name)) || (area && q.includes(area))
          })
          .sort((x, y) => Number(Boolean(y.a.locality && q.includes(y.a.locality.toLowerCase()))) -
            Number(Boolean(x.a.locality && q.includes(x.a.locality.toLowerCase()))))
          .map(({ item }) => item)
      }
    }

    const local = matched.filter((item) => item.isLocal)
    const intl = matched.filter((item) => !item.isLocal)

    return [...local, ...intl].slice(0, 5)
  }, [searchQuery, remoteResults])

  // Construct combined full address and emit
  const emitFullAddress = (fields) => {
    const { unit, street, city, state, zip, cntry } = fields
    const parts = []
    if (unit?.trim()) parts.push(unit.trim())
    if (street?.trim()) parts.push(street.trim())
    if (city?.trim()) parts.push(city.trim())
    if (state?.trim() && state !== city) parts.push(state.trim())
    if (zip?.trim()) parts.push(zip.trim())
    if (cntry?.trim()) parts.push(cntry.trim())

    onChange(parts.join(', '))
  }

  // Parse address_components and inject:
  // - route -> Street Address
  // - locality -> City
  // - administrative_area_level_1 -> State / Province
  // - postal_code -> Postal Code (auto-filled)
  // - country -> Country dropdown
  const applyAddressComponents = (place) => {
    const comp = place.address_components || {}
    const parsedStreet = comp.route || ''
    const parsedCity = comp.locality || ''
    const parsedState = comp.administrative_area_level_1 || ''
    const parsedCountry = comp.country || 'Philippines'
    const parsedZip = comp.postal_code || ''

    setStreetAddress(parsedStreet)
    setLocality(parsedCity)
    setAdminArea(parsedState)
    setCountry(parsedCountry)
    setPostalCode(parsedZip)
    setSearchQuery(place.description)
    setIsOpen(false)

    emitFullAddress({
      unit: unitFloor,
      street: parsedStreet,
      city: parsedCity,
      state: parsedState,
      zip: parsedZip,
      cntry: parsedCountry,
    })

    // Keyboard shortcut action: Automatically shifts cursor focus straight to Apt/Unit field!
    setTimeout(() => {
      unitInputRef.current?.focus()
    }, 50)
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown') setIsOpen(true)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions[highlightedIndex]) {
        applyAddressComponents(suggestions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const INPUT_STYLE = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
    placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150`
  const LABEL_STYLE = 'block text-xs font-medium text-muted mb-1.5'

  return (
    <div className="space-y-3" ref={containerRef}>
      
      {/* STEP 1: Main Autocomplete Search Bar at the Very Top */}
      <div className="relative">
        <div className="flex items-center justify-between">
          <label className={LABEL_STYLE}>
            Search for Address {required && <span className="text-red-500">*</span>}
          </label>
        </div>

        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            disabled={disabled}
            value={searchQuery}
            onFocus={() => {
              if (searchQuery.trim().length > 0) setIsOpen(true)
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsOpen(true)
              setHighlightedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Start typing an address, street, or landmark (e.g. Ortigas, BGC, Ayala, Clark)..."
            className={`${INPUT_STYLE} pl-8.5 pr-8`}
          />
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />

          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setStreetAddress('')
                setLocality('')
                setAdminArea('')
                setPostalCode('')
                emitFullAddress({ unit: unitFloor, street: '', city: '', state: '', zip: '', cntry: country })
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Dropdown Predictions List (Capped to 5 items with smooth scroll) */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-surface shadow-xl overflow-hidden animate-fadeIn">
            <div className="divide-y divide-border/20 max-h-52 overflow-y-auto">
              {suggestions.map((item, idx) => {
                const isHighlighted = idx === highlightedIndex
                return (
                  <button
                    key={item.description}
                    type="button"
                    onClick={() => applyAddressComponents(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full px-3 py-2.5 text-xs flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                      isHighlighted ? 'bg-primary/15 text-primary-dark font-medium' : 'hover:bg-bg text-ink'
                    }`}
                  >
                    <div className="shrink-0 text-muted">
                      {item.isLocal ? (
                        <Navigation size={13} className="text-primary-dark" />
                      ) : (
                        <Globe size={13} className="text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.description}</p>
                      <p className="text-[10.5px] text-muted">
                        Postal Code: {item.address_components.postal_code} • {item.address_components.country}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Secondary Manual Field Strictly for Apt, Suite, Unit, or Floor No. */}
      <div>
        <label className={LABEL_STYLE}>Apt, Suite, Unit, or Floor No. (Optional)</label>
        <input
          ref={unitInputRef}
          type="text"
          disabled={disabled}
          value={unitFloor}
          onChange={(e) => {
            const val = e.target.value
            setUnitFloor(val)
            emitFullAddress({
              unit: val,
              street: streetAddress,
              city: locality,
              state: adminArea,
              zip: postalCode,
              cntry: country,
            })
          }}
          placeholder="e.g. Unit 402, 4th Floor"
          className={INPUT_STYLE}
        />
      </div>

      {/* STEP 2 (Cont.): Separated "Street Address" Auto-Injected from Google Places */}
      <div>
        <label className={LABEL_STYLE}>Street Address</label>
        <input
          type="text"
          disabled={disabled}
          value={streetAddress}
          onChange={(e) => {
            const val = e.target.value
            setStreetAddress(val)
            emitFullAddress({
              unit: unitFloor,
              street: val,
              city: locality,
              state: adminArea,
              zip: postalCode,
              cntry: country,
            })
          }}
          placeholder="e.g. Ortigas Jr. Rd., Ayala Ave., or Roxas Blvd."
          className={INPUT_STYLE}
        />
      </div>

      {/* STEP 3: Injected City, State, Postal Code & Country Dropdown */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_STYLE}>City</label>
          <input
            type="text"
            disabled={disabled}
            value={locality}
            onChange={(e) => {
              setLocality(e.target.value)
              emitFullAddress({
                unit: unitFloor,
                street: streetAddress,
                city: e.target.value,
                state: adminArea,
                zip: postalCode,
                cntry: country,
              })
            }}
            placeholder="City"
            className={INPUT_STYLE}
          />
        </div>

        <div>
          <label className={LABEL_STYLE}>State / Province</label>
          <input
            type="text"
            disabled={disabled}
            value={adminArea}
            onChange={(e) => {
              setAdminArea(e.target.value)
              emitFullAddress({
                unit: unitFloor,
                street: streetAddress,
                city: locality,
                state: e.target.value,
                zip: postalCode,
                cntry: country,
              })
            }}
            placeholder="Province / State"
            className={INPUT_STYLE}
          />
        </div>

        <div>
          <label className={LABEL_STYLE}>Postal Code</label>
          <input
            type="text"
            disabled={disabled}
            value={postalCode}
            onChange={(e) => {
              setPostalCode(e.target.value)
              emitFullAddress({
                unit: unitFloor,
                street: streetAddress,
                city: locality,
                state: adminArea,
                zip: e.target.value,
                cntry: country,
              })
            }}
            placeholder="e.g. 1605"
            className={`${INPUT_STYLE} font-medium text-primary-dark`}
          />
        </div>

        {/* STEP 3: Open Country Dropdown Selection */}
        <div>
          <label className={LABEL_STYLE}>Country</label>
          <select
            disabled={disabled}
            value={country}
            onChange={(e) => {
              const val = e.target.value
              setCountry(val)
              emitFullAddress({
                unit: unitFloor,
                street: streetAddress,
                city: locality,
                state: adminArea,
                zip: postalCode,
                cntry: val,
              })
            }}
            className={INPUT_STYLE}
          >
            {ALL_COUNTRIES_LIST.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}
