import { useEffect, useMemo, useRef, useState } from 'react';

import ChatHeader from './ChatHeader.jsx';
import OnlineUsers from './OnlineUsers.jsx';
import MessageList from './MessageList.jsx';
import MessageComposer, { TypingIndicator } from './MessageComposer.jsx';
import { useChat } from '../hooks/useChat';
import { api } from '../api/client';

const ChatLayout = ({ session, onLogout, theme, onToggleTheme }) => {
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const {
    messages,
    onlineUsers,
    typingUsers,
    connection,
    conversationReady,
    error,
    clearError,
    sendMessage,
    retryMessage,
    notifyTyping,
  } = useChat(session.username, session.token, activeAgent);

  const composerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchAgents()
      .then((data) => {
        if (!cancelled) setAgents(data);
      })
      .catch(() => {
        /* non-fatal: sidebar simply shows no agents */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const agentNames = useMemo(() => new Set(agents.map((agent) => agent.name)), [agents]);
  const mentionOptions = useMemo(
    () =>
      activeAgent
        ? []
        : [
            ...onlineUsers
              .filter((name) => name !== session.username && !agentNames.has(name))
              .map((name) => ({ name, type: 'person' })),
            ...agents.map((agent) => ({ name: agent.name, type: 'agent' })),
          ],
    [activeAgent, onlineUsers, session.username, agentNames, agents]
  );

  const handleMention = (name) => composerRef.current?.insertMention(`@${name} `);

  return (
    <div className="app-shell">
      <ChatHeader
        username={session.username}
        connection={connection}
        onlineCount={onlineUsers.length}
        agentCount={agents.length}
        activeAgent={activeAgent}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {connection !== 'connected' ? (
        <div className="connection-banner" role="status">
          Connection lost. Trying to reconnect…
        </div>
      ) : null}

      <div className="chat-body">
        <OnlineUsers
          users={onlineUsers}
          agents={agents}
          currentUsername={session.username}
          onMention={handleMention}
          activeAgent={activeAgent}
          onOpenChat={setActiveAgent}
        />

        <main className="chat-main">
          <MessageList
            messages={messages}
            currentUsername={session.username}
            agentNames={agentNames}
            onRetry={retryMessage}
          />

          <div className="chat-footer">
            <TypingIndicator users={typingUsers} />
            <MessageComposer
              ref={composerRef}
              onSend={sendMessage}
              onTypingChange={notifyTyping}
              mentionOptions={mentionOptions}
              disabled={connection !== 'connected' || !conversationReady}
              placeholder={
                !conversationReady
                  ? 'Opening conversation…'
                  : activeAgent
                  ? `Message ${activeAgent} privately…`
                  : 'Type a message… or @mention an agent'
              }
            />
          </div>
        </main>
      </div>

      {error ? (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="toast-close" onClick={clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ChatLayout;
