import { useTranslation } from '../hooks/useTranslation';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface AuthScreenProps {
  authLoading: boolean;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  loginError: string;
  isLoggingIn: boolean;
  onLoginSubmit: (e: React.FormEvent) => void;
}

export default function AuthScreen({
  authLoading,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  loginError,
  isLoggingIn,
  onLoginSubmit,
}: AuthScreenProps) {
  const { t } = useTranslation();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-primary flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-text-secondary text-sm font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-primary flex items-center justify-center p-6 font-sans relative overflow-hidden">
      <div className="w-full max-w-md space-y-6 z-10">
        <div className="text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo-default.svg`}
            alt="prismdeals Logo"
            className="w-64 h-auto mx-auto"
          />
        </div>
        <Card className="p-6 space-y-4">
          <form onSubmit={onLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-text-secondary font-medium block">
                {t('auth.emailLabel')}
              </label>
              <Input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-text-secondary font-medium block">
                {t('auth.passwordLabel')}
              </label>
              <Input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                required
              />
            </div>
            {loginError && (
              <div className="bg-status-danger/10 border border-status-danger/25 p-3 rounded-xl text-sm text-status-danger font-semibold animate-fadeIn">
                {loginError}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={isLoggingIn}
              className="w-full py-3"
            >
              {isLoggingIn ? t('auth.buttonLoggingIn') : t('auth.buttonLogin')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
