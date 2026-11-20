import { useState, type FormEvent } from 'react';
import { AtSign, Facebook, Mail } from 'lucide-react';
import { useToast } from '@/components/ToastContext';
import { supabase } from '@/lib/supabase';

export default function AuthScreen() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const runAuth = async (action: () => Promise<{ error: Error | null }>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (result.error) throw result.error;
    } catch (authError) {
      const text = authError instanceof Error ? authError.message : 'Authentication failed.';
      console.error('Authentication failed.', authError);
      setError(text);
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
      return;
    }
    const client = supabase;
    await runAuth(async () => {
      const { error: otpError } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            username: username.trim().toLowerCase().replace(/^@/, ''),
          },
        },
      });
      if (!otpError) {
        setOtpSent(true);
        setOtp('');
        setMessage(`A 6-digit confirmation code was sent to ${email.trim()}.`);
      }
      return { error: otpError };
    });
  };

  const resendOtp = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
      return;
    }
    const client = supabase;
    await runAuth(async () => {
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (!resendError) setMessage(`A 6-digit confirmation code was sent to ${email.trim()}.`);
      return { error: resendError };
    });
  };

  const verifyOtp = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
      return;
    }
    const client = supabase;
    await runAuth(async () => {
      const { error: verifyError } = await client.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'signup',
      });
      return { error: verifyError };
    });
  };

  const signInWithPassword = async () => {
    if (!supabase) {
      setError('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
      return;
    }
    const client = supabase;
    await runAuth(() => client.auth.signInWithPassword({ email: email.trim(), password }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otpSent) {
      void verifyOtp();
    } else if (mode === 'login') {
      void signInWithPassword();
    } else {
      void requestOtp();
    }
  };

  const resetOtp = () => {
    setOtpSent(false);
    setOtp('');
    setError('');
    setMessage('');
  };

  const showProviderUnavailable = () => {
    setError('');
    setMessage('');
    showToast('not available', 'error');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08090d] px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950/90 p-6 shadow-[0_24px_100px_rgba(34,211,238,0.12)] sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 via-cyan-400 to-purple-500">
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              fill="none"
              className="h-8 w-8 text-black"
            >
              <path
                d="M8 9L17 16L8 23M19 23H25"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-3xl font-black tracking-tight">f<span className="text-green-400">y</span></p>
          <h1 className="mt-2 text-xl font-bold">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-white/45">
            {mode === 'login' ? 'Sign in and get back to your people.' : 'Find your circle and share what you love.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={showProviderUnavailable}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <span className="font-black text-lg text-blue-400">G</span> Google
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={showProviderUnavailable}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Facebook size={17} className="fill-blue-500 text-blue-500" /> Facebook
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
          <span className="h-px flex-1 bg-white/10" /> or use email <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!otpSent && mode === 'register' && (
            <>
              <label className="block">
                <span className="sr-only">Display name</span>
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-green-400/50">
                  <input
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={40}
                    placeholder="Your name"
                    autoComplete="name"
                    className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-white/30"
                  />
                </span>
              </label>
              <label className="block">
                <span className="sr-only">Username</span>
                <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-green-400/50">
                  <AtSign size={16} className="text-white/35" />
                  <input
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
                    minLength={3}
                    maxLength={24}
                    placeholder="username"
                    autoComplete="username"
                    className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-white/30"
                  />
                </span>
              </label>
            </>
          )}
          <label className="block">
            <span className="sr-only">Email</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-green-400/50">
              <Mail size={16} className="text-white/35" />
              <input
                type="email"
                required
                value={email}
                disabled={otpSent || busy}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                autoComplete="email"
                className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-white/30"
              />
            </span>
          </label>
          {!otpSent && (
            <label className="block">
              <span className="sr-only">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'register' ? 'Create password' : 'Password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-green-400/50"
              />
            </label>
          )}
          {otpSent && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">6-digit email code</span>
              <input
                type="text"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                aria-label="6-digit email code"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xl font-bold tracking-[0.5em] text-white outline-none placeholder:text-white/25 focus:border-green-400/50"
              />
            </label>
          )}
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-green-400/20 bg-green-500/10 p-3 text-xs text-green-200">{message}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-green-400 to-cyan-400 py-3.5 text-sm font-extrabold text-black transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : otpSent
                ? 'Verify code'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Send confirmation code'}
          </button>
        </form>

        {otpSent && (
          <div className="mt-4 flex justify-center gap-4 text-xs">
            <button type="button" disabled={busy} onClick={() => void resendOtp()} className="font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-50">
              Resend code
            </button>
            <button type="button" disabled={busy} onClick={resetOtp} className="font-semibold text-white/50 hover:text-white/80 disabled:opacity-50">
              Change email
            </button>
          </div>
        )}

        <p className="mt-5 text-center text-sm text-white/45">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            disabled={busy || otpSent}
            onClick={() => {
              setMode((current) => current === 'login' ? 'register' : 'login');
              setPassword('');
              setError('');
              setMessage('');
            }}
            className="font-bold text-green-300 hover:text-green-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  );
}
