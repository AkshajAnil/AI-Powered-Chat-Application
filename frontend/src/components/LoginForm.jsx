import { useState } from 'react';

import { api } from '../api/client';
import { initialsOf } from '../utils/format';

const STORAGE_KEY = 'chat.session';

export const loadSession = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (session) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = () => localStorage.removeItem(STORAGE_KEY);

const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = username.trim();
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    try {
      const session = await api.login(value);
      saveSession(session);
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo" aria-hidden="true">
          {initialsOf('Socket Chat')}
        </div>
        <h1>Socket Chat</h1>
        <p className="login-subtitle">
          Real-time chat powered by React, Express and Socket.io. Pick a username to continue.
        </p>

        <label className="field-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="text-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. ada_lovelace"
          autoComplete="username"
          autoFocus
          maxLength={24}
        />

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={busy || !username.trim()}>
          {busy ? 'Joining…' : 'Start chatting'}
        </button>
        <p className="login-hint">Dummy authentication: no password required.</p>
      </form>
    </div>
  );
};

export default LoginForm;
