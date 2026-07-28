import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "./supabase";
import { InstallHelp } from "./InstallHelp";

function SetupRequired() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Local setup</p>
        <h1>Trip</h1>
        <h2>Connect Supabase</h2>
        <p>Copy <code>.env.example</code> to <code>.env.local</code>, then add the project URL and publishable key.</p>
      </section>
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError(undefined);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setSubmitting(false);
  };

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <p className="eyebrow">Shared itinerary</p>
        <h1>Trip</h1>
        <h2>Sign in</h2>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        <InstallHelp />
      </form>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig) return <SetupRequired />;
  if (loading) return <div className="auth-loading">Loading itinerary…</div>;
  if (!session) return <Login />;
  return children;
}
