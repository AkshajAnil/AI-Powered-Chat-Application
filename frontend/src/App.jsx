import { useState } from 'react';

import LoginForm, { loadSession, clearSession } from './components/LoginForm.jsx';
import ChatLayout from './components/ChatLayout.jsx';

const App = () => {
  const [session, setSession] = useState(() => loadSession());

  const handleLogin = (nextSession) => setSession(nextSession);

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  return session ? (
    <ChatLayout session={session} onLogout={handleLogout} />
  ) : (
    <LoginForm onLogin={handleLogin} />
  );
};

export default App;
