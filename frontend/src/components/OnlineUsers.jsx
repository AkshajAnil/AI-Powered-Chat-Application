import { initialsOf } from '../utils/format';

const OnlineUsers = ({
  users,
  agents = [],
  currentUsername,
  onMention,
  activeAgent,
  onOpenChat,
}) => {
  const agentNames = new Set(agents.map((agent) => agent.name));
  const people = users.filter((name) => !agentNames.has(name));

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Chats</h2>
      <ul className="user-list">
        <li>
          <button
            type="button"
            className={`chat-nav-item ${activeAgent ? '' : 'chat-nav-active'}`}
            onClick={() => onOpenChat(null)}
          >
            <span className="avatar avatar-small" aria-hidden="true">
              #
            </span>
            <span>Global chat</span>
          </button>
        </li>
        {agents.map((agent) => (
          <li key={agent.name} className="chat-nav-agent">
            <button
              type="button"
              className={`chat-nav-item ${activeAgent === agent.name ? 'chat-nav-active' : ''}`}
              onClick={() => onOpenChat(agent.name)}
              title={agent.description}
            >
              <span className="avatar avatar-small avatar-agent" aria-hidden="true">
                {initialsOf(agent.name)}
              </span>
              <span className="chat-nav-label">
                {agent.name}
                <span className="ai-chip ai-chip-inline">AI</span>
              </span>
            </button>
            <button
              type="button"
              className="mention-button"
              onClick={() => {
                onOpenChat(null);
                onMention(agent.name);
              }}
              title={`Mention ${agent.name} in global chat`}
            >
              @
            </button>
          </li>
        ))}
      </ul>

      <h2 className="sidebar-title">
        People <span className="count-badge">{people.length}</span>
      </h2>
      <ul className="user-list">
        {people.map((name) => (
          <li key={name} className="user-item">
            <span className="avatar avatar-small" aria-hidden="true">
              {initialsOf(name)}
            </span>
            <span className="user-name">{name}</span>
            {name === currentUsername ? <span className="you-badge">you</span> : null}
            <span className="status-dot" title="Online" aria-hidden="true" />
          </li>
        ))}
        {people.length === 0 ? <li className="user-item user-item-empty">Nobody else here yet</li> : null}
      </ul>

      <p className="sidebar-note">
        Mention an agent with <strong>@Nova</strong>, <strong>@Atlas</strong> or{' '}
        <strong>@Sage</strong> (or tap @) and it replies instantly.
      </p>
    </aside>
  );
};

export default OnlineUsers;
