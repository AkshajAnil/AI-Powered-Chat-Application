import { initialsOf } from '../utils/format';

const OnlineUsers = ({ users, agents = [], currentUsername, onMention }) => {
  const agentNames = new Set(agents.map((agent) => agent.name));
  const people = users.filter((name) => !agentNames.has(name));

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">
        AI Agents <span className="count-badge">{agents.length}</span>
      </h2>
      <ul className="user-list">
        {agents.map((agent) => (
          <li key={agent.name} className="user-item agent-item">
            <span className="avatar avatar-small avatar-agent" aria-hidden="true">
              {initialsOf(agent.name)}
            </span>
            <span className="agent-meta">
              <span className="user-name">
                {agent.name}
                <span className="ai-chip ai-chip-inline">AI</span>
              </span>
              <span className="agent-role">{agent.description}</span>
            </span>
            <button
              type="button"
              className="mention-button"
              onClick={() => onMention(agent.name)}
              title={`Mention ${agent.name}`}
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
