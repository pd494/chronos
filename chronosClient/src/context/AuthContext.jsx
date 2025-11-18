import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { authApi, calendarApi } from '../lib/api'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
]

const AuthContext = createContext()

const USER_STORAGE_KEY = 'chronos:user'
const GOOGLE_CONSENT_FLAG_KEY = 'chronos:google-consent-granted'

const usersAreEqual = (a, b) => {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.email === b.email &&
    (a.name || '') === (b.name || '') &&
    (a.avatar_url || '') === (b.avatar_url || '') &&
    Boolean(a?.has_google_credentials) === Boolean(b?.has_google_credentials)
  )
}

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

const cleanOAuthParams = () => {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const hadCode = url.searchParams.has('code')
    const hadState = url.searchParams.has('state')
    if (!hadCode && !hadState) return
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    const nextQuery = url.searchParams.toString()
    const nextUrl = `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}${url.hash}`
    window.history.replaceState({}, document.title, nextUrl)
  } catch (_) {}
}

const getGoogleConsentFlag = () => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(GOOGLE_CONSENT_FLAG_KEY) === 'true'
  } catch (_) {
    return false
  }
}

const setGoogleConsentFlag = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(GOOGLE_CONSENT_FLAG_KEY, 'true')
    } else {
      window.localStorage.removeItem(GOOGLE_CONSENT_FLAG_KEY)
    }
  } catch (_) {}
}

export const AuthProvider = ({ children }) => {
  const initialStoredUser = useMemo(() => getStoredUser(), [])
  const [user, setUserState] = useState(initialStoredUser)
  const [loading, setLoading] = useState(() => !initialStoredUser)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const isLoggingOutRef = useRef(false)
  const suppressSupabaseSignOutRef = useRef(false)
  const hasProcessedOAuthRef = useRef(false)
  const hasCachedUserRef = useRef(Boolean(initialStoredUser))
  const currentUserRef = useRef(initialStoredUser)
  const isSyncingSessionRef = useRef(false)
  const forcedConsentAttemptRef = useRef(false)
  const lastSessionSignatureRef = useRef(null)
  const lastCheckAuthRef = useRef(0)
  const checkAuthCooldownMs = 30000 // 30 seconds cooldown between checkAuth calls

  const persistUser = useCallback((value) => {
    const prev = currentUserRef.current
    if (usersAreEqual(prev, value)) {
      return
    }
    currentUserRef.current = value || null
    setUserState(value)
    if (typeof window === 'undefined') return
    if (value) {
      try {
        window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(value))
      } catch (_) {
      }
      hasCachedUserRef.current = true
    } else {
      window.sessionStorage.removeItem(USER_STORAGE_KEY)
      hasCachedUserRef.current = false
      hasProcessedOAuthRef.current = false
      lastSessionSignatureRef.current = null
      lastCheckAuthRef.current = 0 // Reset cooldown on logout to allow immediate checkAuth on next login
    }
  }, [])

  const clearSupabaseSession = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      Object.keys(window.sessionStorage || {}).forEach((key) => {
        if (key.startsWith('sb-')) {
          window.sessionStorage.removeItem(key)
        }
      })
      Object.keys(window.localStorage || {}).forEach((key) => {
        if (key.startsWith('sb-')) {
          window.localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.warn('Failed to clear Supabase session storage:', error)
    }
  }, [])

  const startGoogleOAuth = useCallback(
    async ({ forceConsent = false } = {}) => {
      if (typeof window === 'undefined') {
        throw new Error('OAuth login is only available in the browser')
      }
      const hasConsent = getGoogleConsentFlag()
      const shouldForceConsent = forceConsent || !hasConsent
      const promptValues = shouldForceConsent ? 'consent select_account' : 'select_account'
      const queryParams = {
        access_type: 'offline',
        prompt: promptValues,
        include_granted_scopes: 'true'
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: GOOGLE_SCOPES.join(' '),
          queryParams
        }
      })
      if (error) throw error
    },
    []
  )

  useEffect(() => {
    if (user?.has_google_credentials) {
      setGoogleConsentFlag(true)
    }
  }, [user?.has_google_credentials])

  useEffect(() => {
    let unsubscribe

    const initAuth = async () => {
      const processSession = async (session) => {
        const accessToken = session?.access_token
        const refreshToken = session?.refresh_token
        if (!accessToken || !refreshToken) {
          return
        }

        const hasProviderTokens = Boolean(
          session?.provider_token || session?.provider_refresh_token
        )
        const hasExistingUser = Boolean(currentUserRef.current || hasCachedUserRef.current)

        if (hasExistingUser && !hasProviderTokens) {
          try {
            await checkAuth(true) // Force fresh check when switching accounts
          } finally {
            clearSupabaseSession()
          }
          return
        }

        const signature = `${accessToken}:${refreshToken}`
        if (
          isSyncingSessionRef.current ||
          (currentUserRef.current && lastSessionSignatureRef.current === signature)
        ) {
          return
        }
        lastSessionSignatureRef.current = signature
        isSyncingSessionRef.current = true
        hasProcessedOAuthRef.current = true
        try {
          await handleOAuthCallback(session)
        } finally {
          isSyncingSessionRef.current = false
        }
      }

      unsubscribe = supabase.auth.onAuthStateChange(async (event, session) => {
        if (isLoggingOutRef.current) return
        if (event === 'SIGNED_IN' && session) {
          await processSession(session)
        } else if (event === 'SIGNED_OUT') {
          if (suppressSupabaseSignOutRef.current) {
            suppressSupabaseSignOutRef.current = false
          } else {
            persistUser(null)
          }
        } else if (event === 'INITIAL_SESSION') {
          if (session) {
            await processSession(session)
          } else if (!currentUserRef.current) {
            // Only check auth if we don't have a cached user
            await checkAuth()
          }
        }
      })

      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session) {
          await processSession(data.session)
        } else {
          const start = Date.now()
          const poll = async () => {
            if (Date.now() - start > 1500 || hasProcessedOAuthRef.current) return
            const { data: later } = await supabase.auth.getSession()
            if (later?.session) {
              await processSession(later.session)
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
    let shouldClearSupabaseSession = false
    try {
      const supabaseAccessToken = session?.access_token
      const supabaseRefreshToken = session?.refresh_token
      if (!supabaseAccessToken || !supabaseRefreshToken) {
        await checkAuth()
        clearSupabaseSession()
        cleanOAuthParams()
        return
      }

      await authApi.syncSession(supabaseAccessToken, supabaseRefreshToken)
      await checkAuth()
      shouldClearSupabaseSession = true
            
      const providerAccessToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token
      const alreadyHasCredentials = Boolean(currentUserRef.current?.has_google_credentials)

      if (!providerAccessToken || !providerRefreshToken) {
        if (alreadyHasCredentials) {
          forcedConsentAttemptRef.current = false
          return
        }
        if (forcedConsentAttemptRef.current) {
          console.error('Unable to obtain Google refresh token even after forcing consent.')
          return
        }
        forcedConsentAttemptRef.current = true
        setGoogleConsentFlag(false)
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch (_) {}
        await startGoogleOAuth({ forceConsent: true })
        return
      }

      forcedConsentAttemptRef.current = false
      const approxExpiry = new Date(Date.now() + 55 * 60 * 1000).toISOString()
      try {
        await calendarApi.saveCredentials({
          access_token: providerAccessToken,
          refresh_token: providerRefreshToken,
          expires_at: approxExpiry
        })
        setGoogleConsentFlag(true)
      } catch (credError) {
        console.error('Failed to save Google credentials:', credError)
        setGoogleConsentFlag(false)
      }
    } catch (error) {
      persistUser(null)
      clearSupabaseSession()
    } finally {
      if (shouldClearSupabaseSession) {
        clearSupabaseSession()
      }
      cleanOAuthParams()
      if (!currentUserRef.current) {
        hasProcessedOAuthRef.current = false
      }
    }
  }

  const checkAuth = useCallback(async (force = false) => {
    // Skip if we have a valid user and it's been less than cooldown time since last check
    const now = Date.now()
    if (!force && currentUserRef.current && (now - lastCheckAuthRef.current) < checkAuthCooldownMs) {
      return
    }
    
    const hadCachedUser = hasCachedUserRef.current
    // When forcing (e.g., account switch), always show loading state
    const shouldSetLoading = !hadCachedUser || force
    if (shouldSetLoading) {
      setLoading(true)
    }
    
    lastCheckAuthRef.current = now
    
    try {
      let userData
      let attemptedRefresh = false
      while (true) {
        try {
          userData = await authApi.getMe()
          break
        } catch (error) {
          const status = error?.status
          if (!attemptedRefresh && (status === 401 || status === 403)) {
            attemptedRefresh = true
            try {
              await authApi.refresh()
              continue
            } catch (refreshError) {
              throw refreshError
            }
          }
          throw error
        }
      }
      persistUser(userData)
    } catch (error) {
      const status = error?.status
      if (status === 401 || status === 403) {
        persistUser(null)
      } else {
        console.error('Auth verification failed:', error)
      }
    } finally {
      if (shouldSetLoading) {
        setLoading(false)
      }
    }
  }, [persistUser])

  const login = useCallback(
    async (options = {}) => {
      await startGoogleOAuth({ forceConsent: Boolean(options.forceConsent) })
    },
    [startGoogleOAuth]
  )

  const logout = async () => {
    if (isLoggingOutRef.current) return
    setIsLoggingOut(true)
    isLoggingOutRef.current = true

    try {
      if (typeof window !== 'undefined') {
        Object.keys(window.localStorage || {}).forEach((key) => {
          if (key.startsWith('sb-') || key.startsWith('chronos:')) {
            window.localStorage.removeItem(key)
          }
        })
        Object.keys(window.sessionStorage || {}).forEach((key) => {
          if (key.startsWith('sb-') || key.startsWith('chronos:') || key === USER_STORAGE_KEY) {
            window.sessionStorage.removeItem(key)
          }
        })
      }
    } catch (e) {
      console.warn('Failed to clear storage during logout:', e)
    }

    persistUser(null)

    suppressSupabaseSignOutRef.current = true
    const supabaseSignOutPromise = supabase.auth
      .signOut({ scope: 'local' })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          suppressSupabaseSignOutRef.current = false
        }, 400)
      })
    const backendLogoutPromise = authApi.logout({ keepalive: true }).catch((error) => {
      console.error('Backend logout error:', error)
    })

    try {
      await Promise.allSettled([supabaseSignOutPromise, backendLogoutPromise])
    } finally {
      setIsLoggingOut(false)
      isLoggingOutRef.current = false
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleSessionExpired = () => {
      persistUser(null)
    }
    window.addEventListener('chronos:session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('chronos:session-expired', handleSessionExpired)
    }
  }, [persistUser])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
