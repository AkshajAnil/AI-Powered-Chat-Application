import { useState } from 'react';

import { api } from '../api/client';
import { initialsOf } from '../utils/format';

const STORAGE_KEY = 'chat.session';

export const loadSession = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.token || session.token.split('.').length !== 3 || !session?.username) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

export const saveSession = (session) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = () => localStorage.removeItem(STORAGE_KEY);

const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('pilot_user');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = username.trim();
    if (!value || !password || busy) return;
    if (registering && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const session = registering
        ? await api.register(value, password)
        : await api.login(value, password);
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
          Sign in to your chat or create an account to join the conversation.
        </p>

        <label className="field-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="text-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          autoComplete="username"
          autoFocus
          maxLength={24}
        />

        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="text-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          minLength={4}
          maxLength={128}
        />

        {registering ? (
          <>
            <label className="field-label" htmlFor="confirm-password">
              Re-enter password
            </label>
            <input
              id="confirm-password"
              className="text-input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter the same password again"
              autoComplete="new-password"
              minLength={4}
              maxLength={128}
              required
            />
          </>
        ) : null}

        {registering && confirmPassword && password !== confirmPassword ? (
          <p className="form-error" role="status">
            Passwords do not match.
          </p>
        ) : error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="primary-button"
          type="submit"
          disabled={
            busy ||
            !username.trim() ||
            !password ||
            (registering && (!confirmPassword || password !== confirmPassword))
          }
        >
          {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="auth-mode-button"
          onClick={() => {
            setRegistering((current) => !current);
            setConfirmPassword('');
            setError(null);
          }}
        >
          {registering ? 'Already registered? Sign in' : 'New here? Create an account'}
        </button>
        <p className="login-hint">
          Demo login: <strong>pilot_user</strong> / <strong>1234</strong>
        </p>
      </form>
    </div>
  );
};

export default LoginForm;
