import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Create the auth context
const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Set up auth callback listener for Electron
  useEffect(() => {
    // Check for existing session on component mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error checking session:', error)
      } finally {
        setLoading(false)
      }
    }

    checkSession()

    // Listen for auth state changes from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    // Listen for deep link callbacks from Electron if we're in Electron
    if (window.electronAPI) {
      window.electronAPI.onAuthCallback(async (url) => {
        console.log('Auth callback received from Electron:', url)
        
        try {
          // Extract hash from URL
          const hashMatch = url.match(/#(.*)/)
          if (hashMatch && hashMatch[1]) {
            const hash = hashMatch[1]
            console.log('Hash extracted:', hash)
            
            // Use parseFragment helper to extract tokens from hash
            const params = parseFragment(hash)
            
            if (params.access_token && params.refresh_token) {
              // Set the session with the tokens
              const { error } = await supabase.auth.setSession({
                access_token: params.access_token,
                refresh_token: params.refresh_token
              })
              
              if (error) throw error
            }
          }
        } catch (error) {
          console.error('Error processing auth callback:', error)
        }
      })
    }

    // Cleanup subscriptions
    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  // Helper to parse hash fragment into an object of params
  const parseFragment = (hash) => {
    const params = {};
    new URLSearchParams(hash).forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      // Default web callback (for browser)
      const webRedirect = window.location.origin + '/auth-callback';
      const scopes = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';
      
      // If we're running in Electron, open auth in the external browser
      if (window.electronAPI) {
        // Use custom protocol so Google will send the user straight back to the Electron app
        const protocolRedirect = 'chronos://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: protocolRedirect,
            scopes,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        window.electronAPI.send('open-external-url', data.url);
        return;
      }
      
      // Fall back to normal in-app auth for web browser usage (redirects to our React route)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: webRedirect,
          scopes,
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in with Google:', error.message);
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Error signing out:', error.message)
    }
  }

  // Provide auth context to children
  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signInWithGoogle,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 