import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from './useTranslation';

export function useAuthSession({
  onLoginSuccess,
  setIsScraping,
  setScrapingStatus,
}: {
  onLoginSuccess?: () => void;
  setIsScraping?: (v: boolean) => void;
  setScrapingStatus?: (v: string) => void;
} = {}) {
  const { t } = useTranslation();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [appUser, setAppUser] = useState<{ email: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const d = await res.json();
        setAppUser(d.user || null);
        return d.user;
      }
      setAppUser(null);
    } catch {
      setAppUser(null);
    } finally {
      setAuthLoading(false);
    }
    return null;
  }, []);

  const checkSessionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status');
      if (res.ok) {
        const d = await res.json();
        setSessionEmail(d.email || null);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!appUser) return;
    checkSessionStatus();
    const interval = setInterval(checkSessionStatus, 8000);
    return () => clearInterval(interval);
  }, [appUser, checkSessionStatus]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter email and password.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAppUser(data.user);
        onLoginSuccess?.();
        checkSessionStatus();
      } else {
        setLoginError(data.error || t('auth.errorInvalid'));
      }
    } catch {
      setLoginError('Network connection failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAppUser(null);
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const handleTriggerLogin = async () => {
    setIsScraping?.(true);
    setScrapingStatus?.('Opening interactive browser window on your host...');
    try {
      const res = await fetch('/api/login-session', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setScrapingStatus?.(d.success ? 'Authentication completed successfully!' : 'Session watcher finished or timed out.');
        checkSessionStatus();
      } else {
        setScrapingStatus?.('Authentication process failed to trigger.');
      }
    } catch {
      setScrapingStatus?.('Error connecting to backend server.');
    } finally {
      setIsScraping?.(false);
    }
  };

  return {
    sessionEmail,
    appUser,
    setAppUser,
    authLoading,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    setLoginError,
    isLoggingIn,
    checkAuth,
    checkSessionStatus,
    handleLoginSubmit,
    handleLogout,
    handleTriggerLogin,
  };
}
