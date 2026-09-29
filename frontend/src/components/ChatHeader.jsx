import { initialsOf } from '../utils/format';

const CONNECTION_LABEL = {
  connected: 'Live',
  connecting: 'Connecting…',
  disconnected: 'Reconnecting…',
};

const ChatHeader = ({
  username,
  connection,
  onlineCount,
  agentCount = 0,
  activeAgent,
  onLogout,
  theme,
  onToggleTheme,
}) => (
  <header className="chat-header">
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        SC
      </span>
      <div>
        <h1>{activeAgent ? `Chat with ${activeAgent}` : 'Global chat'}</h1>
        <span className="brand-sub">
          {activeAgent
            ? 'Private one-to-one conversation'
            : `${onlineCount} online · ${agentCount} AI ${agentCount === 1 ? 'agent' : 'agents'}`}
        </span>
      </div>
    </div>

    <div className="header-right">
      <span className={`connection-pill connection-${connection}`}>
        <span className="connection-dot" aria-hidden="true" />
        {CONNECTION_LABEL[connection] || connection}
      </span>
      <button
        type="button"
        className="theme-button"
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
      <div className="current-user">
        <span className="avatar avatar-small" aria-hidden="true">
          {initialsOf(username)}
        </span>
        <span className="current-user-name">{username}</span>
      </div>
      <button type="button" className="ghost-button" onClick={onLogout}>
        Leave
      </button>
    </div>
  </header>
);

export default ChatHeader;
