import { initialsOf } from '../utils/format';

const CONNECTION_LABEL = {
  connected: 'Live',
  connecting: 'Connecting…',
  disconnected: 'Reconnecting…',
};

const ChatHeader = ({ username, connection, onlineCount, agentCount = 0, onLogout }) => (
  <header className="chat-header">
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        SC
      </span>
      <div>
        <h1>Socket Chat</h1>
        <span className="brand-sub">
          {onlineCount} online · {agentCount} AI {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>
    </div>

    <div className="header-right">
      <span className={`connection-pill connection-${connection}`}>
        <span className="connection-dot" aria-hidden="true" />
        {CONNECTION_LABEL[connection] || connection}
      </span>
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
