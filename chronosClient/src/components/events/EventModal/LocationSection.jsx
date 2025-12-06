import { useRef, useMemo } from 'react'
import { FiMapPin, FiVideo, FiLoader } from 'react-icons/fi'
import { usePlacesAutocomplete } from '../../../hooks/usePlacesAutocomplete'

const LocationSection = ({
  location, setLocation,
  isGeneratingMeeting, tempEventId,
  handleGenerateMeetingLink, cleanupTemporaryEvent,
  setConferenceRequestId, setShowSuggestions: parentSetShowSuggestions
}) => {
  const locationInputRef = useRef(null)
  const locationContainerRef = useRef(null)

  const handlePlaceSelection = (address) => {
    setLocation(address)
    setConferenceRequestId(null)
    if (!address.includes('meet.google.com')) cleanupTemporaryEvent()
  }

  const { predictions, showSuggestions, isLoading, getPlacePredictions, selectPlace, setShowSuggestions } = usePlacesAutocomplete(locationInputRef, handlePlaceSelection)

  const trimmedLocation = location?.trim()
  const isLocationUrl = useMemo(() => {
    if (!trimmedLocation) return false
    try { const parsed = new URL(trimmedLocation); return ['http:', 'https:'].includes(parsed.protocol) }
    catch { return false }
  }, [trimmedLocation])

  const googleMapsLink = useMemo(() => {
    if (!trimmedLocation || isLocationUrl) return ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`
  }, [trimmedLocation, isLocationUrl])

  return (
    <div className="px-4 py-2.5 border-b border-gray-100 relative overflow-visible">
      <div className="flex items-center gap-2" ref={locationContainerRef}>
        <FiMapPin className="text-gray-400 flex-shrink-0" size={20} />
        <div className="flex-1 relative min-w-0">
          <input
            ref={locationInputRef}
            type="text"
            value={location}
            onChange={(e) => {
              const value = e.target.value
              if (value !== location && !value.includes('meet.google.com')) cleanupTemporaryEvent()
              setLocation(value)
              setConferenceRequestId(null)
              getPlacePredictions(value)
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Add location or URL"
            className="w-full px-0 py-1 text-sm text-gray-900 border-none focus:outline-none focus:ring-0 truncate"
          />
          {isLoading && <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none"><FiLoader className="animate-spin text-gray-400" size={16} /></div>}
        </div>
        {!trimmedLocation || (trimmedLocation && isLocationUrl) || isGeneratingMeeting ? (
          <div className="flex flex-col items-end">
            {trimmedLocation && isLocationUrl && !isGeneratingMeeting ? (
              <a href={trimmedLocation} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs flex-shrink-0 backdrop-blur transition-colors bg-blue-500/80 text-white hover:bg-blue-600/80 border border-blue-500/50">
                <FiVideo className="text-white" size={16} />
                <span className="hidden sm:inline">Join meeting</span>
              </a>
            ) : (
              <button type="button" onClick={handleGenerateMeetingLink} disabled={isGeneratingMeeting}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs flex-shrink-0 backdrop-blur disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  tempEventId || isGeneratingMeeting ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-white/90'
                }`}>
                {isGeneratingMeeting ? (
                  <><FiLoader className="animate-spin text-white" size={16} /><span className="hidden sm:inline">Generating link...</span></>
                ) : (
                  <><FiVideo size={16} style={{ color: tempEventId ? 'white' : '#4b5563' }} /><span className="hidden sm:inline">Generate Google Meet</span></>
                )}
              </button>
            )}
          </div>
        ) : trimmedLocation && !isLocationUrl ? (
          <a href={googleMapsLink} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 border border-gray-200 rounded-lg hover:bg-white/90 text-xs text-gray-700 flex-shrink-0 backdrop-blur">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 4.75 3.75 9.1 6.5 11.36a1 1 0 001 0C15.25 18.1 19 13.75 19 9c0-3.87-3.13-7-7-7zm0 14c-2.76-2.5-5-6.02-5-7.5 0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.48-2.24 5-5 7.5zm0-10a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>
            <span className="hidden sm:inline">Get directions</span>
          </a>
        ) : null}
      </div>
      {showSuggestions && predictions.length > 0 && (
        <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] overflow-y-auto overflow-x-hidden" style={{ maxHeight: '320px', scrollBehavior: 'smooth' }}>
          {predictions.map((prediction) => (
            <button key={prediction.place_id} type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectPlace(prediction) }}
              onMouseDown={(e) => e.preventDefault()}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs text-gray-900 border-b border-gray-100 last:border-b-0 first:rounded-t-lg last:rounded-b-lg">
              <div className="font-medium text-xs leading-tight">{prediction.main_text}</div>
              {prediction.secondary_text && <div className="text-xs text-gray-500 leading-tight mt-0.5">{prediction.secondary_text}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LocationSection
