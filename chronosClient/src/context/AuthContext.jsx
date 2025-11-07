import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authApi, calendarApi } from '../lib/api'

const AuthContext = createContext()

const USER_STORAGE_KEY = 'chronos:user'

const getStoredUser = () => {
  if (typeof window === 'undefined') return null
  const stored = window.sessionStorage.getItem(USER_STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch (_) {
    return null
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUserState] = useState(() => getStoredUser())
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const isLoggingOutRef = useRef(false)
  const hasProcessedOAuthRef = useRef(false)

  const persistUser = useCallback((value) => {
    setUserState(value)
    if (typeof window === 'undefined') return
    if (value) {
      try {
        window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(value))
      } catch (_) {
      }
    } else {
      window.sessionStorage.removeItem(USER_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    let unsubscribe

    const initAuth = async () => {
      unsubscribe = supabase.auth.onAuthStateChange(async (event, session) => {
        if (isLoggingOutRef.current) return
        if (event === 'SIGNED_IN' && session) {
          if (!hasProcessedOAuthRef.current) {
            hasProcessedOAuthRef.current = true
            await handleOAuthCallback(session)
          }
        } else if (event === 'SIGNED_OUT') {
          persistUser(null)
        } else if (event === 'INITIAL_SESSION') {
          if (session) {
            if (!hasProcessedOAuthRef.current) {
              hasProcessedOAuthRef.current = true
              await handleOAuthCallback(session)
            }
          } else {
            await checkAuth()
          }
        }
      })

      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session && !hasProcessedOAuthRef.current) {
          hasProcessedOAuthRef.current = true
          await handleOAuthCallback(data.session)
        } else {
          const start = Date.now()
          const poll = async () => {
            if (Date.now() - start > 1500 || hasProcessedOAuthRef.current) return
            const { data: later } = await supabase.auth.getSession()
            if (later?.session && !hasProcessedOAuthRef.current) {
              hasProcessedOAuthRef.current = true
              await handleOAuthCallback(later.session)
              return
            }
            setTimeout(poll, 150)
          }
          setTimeout(poll, 150)
        }
      } catch (_) {}
    }

    initAuth()
    return () => unsubscribe?.data?.subscription?.unsubscribe()
  }, [])

  const handleOAuthCallback = async (session) => {
    try {
      await authApi.syncSession(session.access_token, session.refresh_token)
      await checkAuth()
            
      const providerAccessToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token

      if (providerAccessToken && providerRefreshToken) {
        await calendarApi.saveCredentials({
          access_token: providerAccessToken,
          refresh_token: providerRefreshToken,
          expires_at: session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null,
        })
      }
      await supabase.auth.signOut({ scope: 'local' })
    } catch (error) {
      persistUser(null)
    }
  }

  const checkAuth = async () => {
    try {
      const userData = await authApi.getMe()
      persistUser(userData)
    } catch (error) {
      // If getMe fails, just set user to null - don't try to refresh
      // The apiFetch will handle refreshes for other endpoints automatically
      persistUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/calendar.readonly'
        ].join(' '),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true'
        }
      }
    })
    if (error) throw error
  }

  const logout = async () => {
    setIsLoggingOut(true)
    isLoggingOutRef.current = true

    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => window.localStorage.removeItem(k))
      Object.keys(window.sessionStorage)
        .filter((k) => k.startsWith('sb-') || k.startsWith('chronos:'))
        .forEach((k) => window.sessionStorage.removeItem(k))
    } catch (e) {
    }
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)) // timeout so we don't hang
      ])
    } catch (e) {
    }
    
    try {
      await authApi.logout()
    } catch (error) {
      console.error('Backend logout error:', error)
    }
    
    
    persistUser(null)
    
    
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
