import { useEffect } from 'react';
import { useLocation } from 'wouter';

export function usePostLoginRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check for stored redirect URL after successful authentication
    const storedRedirect = sessionStorage.getItem('postLoginRedirect');
    
    if (storedRedirect) {
      // Remove from session storage to avoid repeated redirects
      sessionStorage.removeItem('postLoginRedirect');
      
      // Redirect to the stored URL
      setLocation(storedRedirect);
    }
  }, [setLocation]);
}