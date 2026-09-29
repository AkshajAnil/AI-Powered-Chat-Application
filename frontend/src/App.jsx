import { useEffect, useState } from 'react';

import LoginForm, { loadSession, clearSession } from './components/LoginForm.jsx';
import ChatLayout from './components/ChatLayout.jsx';

const THEME_KEY = 'chat.theme';

const loadTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const App = () => {
  const [session, setSession] = useState(() => loadSession());
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f1f5f9');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Keep the selected theme for this session if storage is unavailable.
    }
  }, [theme]);

  const handleLogin = (nextSession) => setSession(nextSession);

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  return session ? (
    <ChatLayout
      session={session}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    />
  ) : (
    <LoginForm onLogin={handleLogin} />
  );
};

export default App;
