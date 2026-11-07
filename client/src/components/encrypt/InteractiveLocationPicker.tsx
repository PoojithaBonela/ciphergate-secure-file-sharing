import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { Search, Loader2, MapPin, Navigation } from 'lucide-react'

// Custom electric-blue pin icon matching Encra's theme
const encraPinIcon = L.divIcon({
  className: 'encra-leaflet-pin',
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        background: #2997FF;
        transform: rotate(-45deg);
        border: 2px solid #FFFFFF;
        box-shadow: 0 0 18px rgba(41, 151, 255, 0.75), 0 4px 10px rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #050913;
        "></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

interface Suggestion {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

export interface LocationPickerProps {
  latitude: number
  longitude: number
  radiusKm: number
  locationName: string
  onChange: (lat: number, lng: number, radiusKm: number, name: string) => void
}

/**
 * Controller component to smoothly pan/zoom map when coordinates change externally
 */
function MapCenterController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { duration: 1 })
  }, [lat, lng, map])
  return null
}

/**
 * Map click listener to allow setting location by clicking anywhere on the map
 */
function MapClickHandler({
  onSelectCoordinates,
}: {
  onSelectCoordinates: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onSelectCoordinates(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function InteractiveLocationPicker({
  latitude,
  longitude,
  radiusKm,
  locationName,
  onChange,
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState(locationName || '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Keep search input in sync if parent changes locationName
  useEffect(() => {
    if (locationName && !searchQuery) {
      setSearchQuery(locationName)
    }
  }, [locationName, searchQuery])

  // Click outside to dismiss suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search execution (can be triggered by debounce, enter key, or search button)
  const executeSearch = useCallback(
    async (queryText?: string, selectFirst: boolean = false) => {
      const query = (queryText !== undefined ? queryText : searchQuery).trim()
      if (query.length < 2) {
        setSuggestions([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query,
        )}&limit=5&addressdetails=1`
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        })
        if (!res.ok) throw new Error('Geocoding request failed')
        const data: Suggestion[] = await res.json()
        setSuggestions(data)

        if (selectFirst && data.length > 0) {
          const top = data[0]
          const lat = parseFloat(top.lat)
          const lng = parseFloat(top.lon)
          setSearchQuery(top.display_name)
          setShowSuggestions(false)
          onChange(lat, lng, radiusKm, top.display_name)
        } else if (data.length > 0) {
          setShowSuggestions(true)
        }
      } catch (err) {
        console.warn('[geocoding] Search query failed:', err)
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    },
    [onChange, radiusKm, searchQuery],
  )

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      void executeSearch(val, false)
    }, 450)
  }

  // Reverse geocode when clicking map or dragging marker
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        })
        if (res.ok) {
          const data = await res.json()
          if (data && data.display_name) {
            setSearchQuery(data.display_name)
            onChange(lat, lng, radiusKm, data.display_name)
            return
          }
        }
      } catch {
        // Fallback to coordinates string
      }
      const fallbackName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      setSearchQuery(fallbackName)
      onChange(lat, lng, radiusKm, fallbackName)
    },
    [onChange, radiusKm],
  )

  const handleSelectSuggestion = (item: Suggestion) => {
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    setSearchQuery(item.display_name)
    setShowSuggestions(false)
    onChange(lat, lng, radiusKm, item.display_name)
  }

  const handleMarkerDragEnd = (e: L.DragEndEvent) => {
    const marker = e.target as L.Marker
    const pos = marker.getLatLng()
    void reverseGeocode(pos.lat, pos.lng)
  }

  const handleMapClick = (lat: number, lng: number) => {
    void reverseGeocode(lat, lng)
  }

  const handleRadiusChange = (newRadius: number) => {
    onChange(latitude, longitude, newRadius, locationName || searchQuery)
  }

  // Current radius in meters for Leaflet Circle
  const radiusMeters = radiusKm * 1000

  return (
    <div className="space-y-3.5">
      {/* ── Search Input & Autocomplete Dropdown ───────────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <label className="block text-xs font-semibold text-[#8CA4C5] mb-1.5">
          Search Location, Landmark, or Address
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8CA4C5] absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  void executeSearch(searchQuery, true)
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true)
              }}
              placeholder="Search city, university, building, or address (e.g. Woxsen University)..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0A1220] border border-[#202B3D] text-[#F5F7FA] placeholder-[#8CA4C5]/45 text-xs sm:text-sm focus:outline-none focus:border-[#2997FF] transition-colors"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 text-[#2997FF] animate-spin absolute right-3 top-3" />
            )}
          </div>

          <button
            type="button"
            onClick={() => void executeSearch(searchQuery, true)}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#2997FF]/15 hover:bg-[#2997FF]/25 border border-[#2997FF]/35 text-[#2997FF] hover:text-[#58adff] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isSearching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>Search</span>
          </button>
        </div>

        {/* Suggestion Dropdown List */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-[1000] left-0 right-0 mt-1.5 py-1.5 rounded-xl bg-[#0A1220] border border-[#202B3D] shadow-[0_12px_30px_rgba(0,0,0,0.6)] backdrop-blur-md max-h-56 overflow-auto">
            {suggestions.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className="w-full px-3.5 py-2 text-left text-xs text-[#F5F7FA] hover:bg-[#111E30] hover:text-[#2997FF] transition-colors flex items-start gap-2.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#2997FF] shrink-0 mt-0.5" />
                <span className="truncate">{item.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Permitted Radius Selector ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <label className="text-xs font-semibold text-[#8CA4C5] flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-[#2997FF]" />
          <span>Permitted Radius:</span>
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[0.5, 1, 5, 25, 50].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRadiusChange(r)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${radiusKm === r
                  ? 'bg-[#2997FF]/20 text-[#2997FF] border-[#2997FF] font-bold shadow-[0_0_12px_rgba(41,151,255,0.25)]'
                  : 'bg-[#0A1220] text-[#A1ADBF] border-[#202B3D] hover:bg-[#111E30] hover:border-[#2997FF]/40'
                }`}
            >
              {r >= 1 ? `${r} km` : `${r * 1000} m`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Interactive Leaflet Map Container ─────────────────────────── */}
      <div className="relative h-64 sm:h-72 rounded-xl border border-[#202B3D] overflow-hidden shadow-inner bg-[#050913]">
        <MapContainer
          center={[latitude, longitude]}
          zoom={13}
          scrollWheelZoom={false}
          className="w-full h-full"
          style={{ background: '#050913' }}
        >
          {/* Standard OpenStreetMap tiles (subdomains restricted to valid OSM sharding: a, b, c) */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            subdomains="abc"
            maxZoom={19}
          />

          <MapCenterController lat={latitude} lng={longitude} />
          <MapClickHandler onSelectCoordinates={handleMapClick} />

          {/* Draggable location marker */}
          <Marker
            position={[latitude, longitude]}
            icon={encraPinIcon}
            draggable={true}
            eventHandlers={{
              dragend: handleMarkerDragEnd,
            }}
          />

          {/* Dynamic permitted radius circle */}
          <Circle
            center={[latitude, longitude]}
            radius={radiusMeters}
            pathOptions={{
              color: '#2997FF',
              fillColor: '#2997FF',
              fillOpacity: 0.18,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        </MapContainer>

        {/* Floating map hint */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-[#8CA4C5] bg-[#050913]/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#202B3D]/80">
          <span>Click map or drag pin to position</span>
          <span className="text-[#2997FF] font-medium">
            Radius: {radiusKm >= 1 ? `${radiusKm} km` : `${radiusKm * 1000} m`}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#8CA4C5]">
        <span className="truncate max-w-[70%]">
          Selected: <strong className="text-[#F5F7FA] font-mono">{latitude.toFixed(4)}, {longitude.toFixed(4)}</strong>
        </span>
        <span className="text-teal-400 font-medium">✓ AES-256-GCM Encrypted Storage</span>
      </div>
    </div>
  )
}

