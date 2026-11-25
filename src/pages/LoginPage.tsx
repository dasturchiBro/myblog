import { useState } from 'react';
import { buildLocalizedPath, getDictionary } from '../i18n';
import type { AdminUser, LanguageCode } from '../types';
import { adminFetch, setAuthToken } from '../utils/authClient';

interface LoginPageProps {
  lang: LanguageCode;
  onAuthenticated: (user: AdminUser) => void;
  onNavigate: (path: string) => void;
}

export function LoginPage({ lang, onAuthenticated, onNavigate }: LoginPageProps) {
  const t = getDictionary(lang);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 429) {
        setError(t.auth.rateLimited);
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.user) {
        setError(t.auth.invalidCredentials);
        setSubmitting(false);
        return;
      }

      if (typeof data.token === 'string') {
        setAuthToken(data.token);
      }
      onAuthenticated(data.user);
      onNavigate('/admin');
    } catch {
      setError(t.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F4EE] pt-28 pb-20 px-4 flex items-start justify-center">
      <div className="w-full max-w-md rounded-xl bg-[#FBF9F5] border border-[#1C241E]/14 p-7 sm:p-8 shadow-sm">
        <form onSubmit={handleLogin} className="space-y-4">
          <h1 className="font-display text-2xl font-semibold text-[#1C241E]">
            {t.auth.loginTitle}
          </h1>
          <p className="text-sm text-[#435046] leading-relaxed">
            {t.auth.loginSubtitle}
          </p>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-[#9A3412]/10 border border-[#9A3412]/25 text-xs text-[#7C2D12]"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
              {t.auth.usernameLabel}
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/16 text-sm text-[#1C241E]"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-[#3D4A3F] mb-1.5">
              {t.auth.passwordLabel}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#F7F4EE] border border-[#1C241E]/16 text-sm text-[#1C241E]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-lg bg-[#214029] text-[#F7F4EE] text-sm font-medium hover:bg-[#19321F] disabled:opacity-60 cursor-pointer"
          >
            {submitting ? t.auth.loggingIn : t.auth.loginButton}
          </button>

          <div className="pt-2 text-center">
            <a
              href={buildLocalizedPath(lang, '/')}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(buildLocalizedPath(lang, '/'));
              }}
              className="text-xs text-[#546357] hover:text-[#1C241E] hover:underline underline-offset-4"
            >
              {t.nav.backToForest}
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
