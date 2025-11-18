import { useState, useRef } from 'react'

// Using Geoapify API - Free tier: 3,000 requests/day
// Documentation: https://www.geoapify.com/geocoding-api

const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY || ''

const searchGeoapify = async (query) => {
  if (!query || query.trim().length < 2 || !GEOAPIFY_API_KEY) {
    return []
  }

  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_API_KEY}&limit=5`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      console.error('Geoapify API error:', response.status, response.statusText)
      return []
    }
    
    const data = await response.json()
    
    if (data.features && Array.isArray(data.features)) {
      return data.features.map((feature) => {
        const properties = feature.properties || {}
        const address = properties.formatted || properties.name || ''
        const name = properties.name || address.split(',')[0] || ''
        const secondary = [
          properties.street,
          properties.city,
          properties.state,
          properties.country
        ].filter(Boolean).join(', ')
        
        return {
          place_id: feature.properties?.place_id || feature.id || Math.random().toString(),
          description: address,
          main_text: name,
          secondary_text: secondary || address.split(',').slice(1, 3).join(',').trim(),
          formatted_address: address,
          feature: feature, // Keep full feature for future use
        }
      })
    }
    
    return []
  } catch (error) {
    console.error('Geoapify search error:', error)
    return []
  }
}

export const usePlacesAutocomplete = (inputRef, onPlaceSelect) => {
  const [predictions, setPredictions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const searchTimeoutRef = useRef(null)

  const getPlacePredictions = async (input) => {
    if (!input || input.trim().length < 2) {
      setPredictions([])
      setShowSuggestions(false)
      return
    }

    if (!GEOAPIFY_API_KEY) {
      console.warn('Geoapify API key not found. Set VITE_GEOAPIFY_API_KEY in your .env file')
      return
    }

    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce search requests
    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true)
      
      try {
        const results = await searchGeoapify(input)
        setPredictions(results)
        setShowSuggestions(results.length > 0)
      } catch (error) {
        console.error('Error searching locations:', error)
        setPredictions([])
        setShowSuggestions(false)
      } finally {
        setIsLoading(false)
      }
    }, 300) // Debounce 300ms
  }

  const selectPlace = (prediction) => {
    const address = prediction.formatted_address || prediction.description
    if (onPlaceSelect) {
      onPlaceSelect(address)
    }
    setShowSuggestions(false)
  }

  return {
    predictions,
    showSuggestions,
    isLoading,
    getPlacePredictions,
    selectPlace,
    setShowSuggestions,
  }
}
