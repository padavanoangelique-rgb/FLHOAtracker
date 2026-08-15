'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    router.push('/');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>HOA Tracker</h1>
        <form onSubmit={handleLogin}>
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <button className="btn-gold" type="submit" style={{ width: '100%', marginTop: 8 }}>Log In</button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          Staff accounts are created in the Supabase dashboard (Authentication → Users → Add user).
        </p>
      </div>
    </div>
  );
}
