import { useEffect } from 'react';

export default function AuthCallback() {
  useEffect(() => {
    // Get the current URL including hash parameters
    const hashParams = window.location.hash;
    
    // Log for debugging
    console.log('Auth callback received, redirecting to Electron app');
    
    // Redirect to the Electron app using the custom protocol
    window.location.href = `chronos://auth/callback${hashParams}`;
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Authentication Successful</h2>
        <p className="text-gray-600">Redirecting back to Chronos app...</p>
      </div>
    </div>
  );
} 