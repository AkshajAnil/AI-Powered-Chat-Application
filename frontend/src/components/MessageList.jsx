import { useEffect, useRef, useState } from 'react';

import { formatTime, initialsOf } from '../utils/format';

const StatusTicks = ({ status }) => {
  if (status === 'sending') return <span className="ticks" title="Sending…">◌</span>;
  if (status === 'failed') return <span className="ticks ticks-failed" title="Failed">!</span>;
  if (status === 'delivered') return <span className="ticks ticks-done" title="Delivered">✓✓</span>;
  if (status === 'read') return <span className="ticks ticks-read" title="Read">✓✓</span>;
  return <span className="ticks" title="Sent">✓</span>;
};

const MessageItem = ({ message, isOwn, showAuthor, isAgent, onRetry }) => {
  const failed = message.status === 'failed';

  return (
    <div className={`message-row ${isOwn ? 'message-own' : 'message-other'} ${isAgent ? 'message-agent-row' : ''}`}>
      {!isOwn && (
        <div className={`avatar avatar-small ${isAgent ? 'avatar-agent' : ''}`} aria-hidden="true">
          {initialsOf(message.author)}
        </div>
      )}
      <div className="message-content">
        {showAuthor && !isOwn ? (
          <span className="message-author">
            {message.author}
            {isAgent ? <span className="ai-chip">AI</span> : null}
          </span>
        ) : null}
        <div className={`bubble ${isOwn ? 'bubble-own' : 'bubble-other'} ${isAgent ? 'bubble-agent' : ''} ${failed ? 'bubble-failed' : ''}`}>
          <span className="bubble-text">{message.text}</span>
          <span className="bubble-meta">
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {isOwn ? <StatusTicks status={message.status} /> : null}
          </span>
        </div>
        {failed ? (
          <button
            type="button"
            className="retry-button"
            onClick={() => onRetry(message.clientId)}
          >
            Retry send
          </button>
        ) : null}
      </div>
    </div>
  );
};

const MessageList = ({ messages, currentUsername, agentNames = new Set(), onRetry }) => {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 120);
  };

  let previousAuthor = null;
  let previousTime = 0;

  return (
    <div className="message-list" ref={containerRef} onScroll={handleScroll}>
      {messages.length === 0 ? (
        <div className="empty-state">
          <p>No messages yet.</p>
          <p>Say hello to start the conversation.</p>
        </div>
      ) : null}

      {messages.map((message) => {
        const created = new Date(message.createdAt).getTime();
        const sameAuthor = message.author === previousAuthor;
        const closeInTime = created - previousTime < 5 * 60 * 1000;
        const showAuthor = !(sameAuthor && closeInTime);
        previousAuthor = message.author;
        previousTime = created;

        return (
          <MessageItem
            key={message.id}
            message={message}
            isOwn={message.author === currentUsername}
            isAgent={agentNames.has(message.author)}
            showAuthor={showAuthor}
            onRetry={onRetry}
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
