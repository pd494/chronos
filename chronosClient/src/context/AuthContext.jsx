import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { authApi } from '../lib/api'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const isLoggingOutRef = useRef(false)
  const hasProcessedOAuthRef = useRef(false)

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
          setUser(null)
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
      await supabase.auth.signOut({ scope: 'local' })
    } catch (error) {
      setUser(null)
    }
  }

  const checkAuth = async () => {
    try {
      const userData = await authApi.getMe()
      setUser(userData)
    } catch (error) {
      console.log('checkAuth error:', error.message)
      if (error.message.includes('expired')) {
        try {
          await authApi.refresh()
          return checkAuth()
        } catch (refreshError) {
          console.log('Refresh failed, setting user to null')
          setUser(null)
        }
      } else {
        console.log('Auth check failed, setting user to null')
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        scopes: 'https://www.googleapis.com/auth/calendar.events'
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
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => window.sessionStorage.removeItem(k))
    } catch (e) {
      // ignore
    }

    console.log('Signing out from Supabase (local scope)...')
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)) // timeout so we don't hang
      ])
      console.log('Supabase local signout attempted')
    } catch (e) {
      console.log('Supabase local signout error (ignored):', e?.message)
    }
    
    
    try {
      console.log('Calling backend logout...')
      await authApi.logout()
      console.log('Backend logout successful')
    } catch (error) {
      console.error('Backend logout error:', error)
    }
    
    
    setUser(null)
    console.log('User set to null')
    
    
    console.log('Reloading page...')
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
