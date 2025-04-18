import { useState, useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../supabaseClient';
import './Auth.css';

export default function AuthComponent() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div className="auth-container">
        <h1>Chrono</h1>
        <p>Your calendar assistant with to-do list</p>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          providers={['google']}
          redirectTo={window.location.origin}
        />
      </div>
    );
  } else {
    return (
      <div className="auth-container">
        <h2>You're logged in!</h2>
        <button onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </div>
    );
  }
}
