import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { formatUserList, initialsOf } from '../utils/format';

const TypingIndicator = ({ users }) => {
  if (users.length === 0) return <div className="typing-indicator typing-idle" aria-hidden="true" />;

  return (
    <div className="typing-indicator" role="status">
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="typing-text">
        {formatUserList(users)} {users.length === 1 ? 'is' : 'are'} typing…
      </span>
    </div>
  );
};

const MessageComposer = forwardRef(function MessageComposer(
  { onSend, onTypingChange, disabled, placeholder, mentionOptions = [] },
  ref
) {
  const [text, setText] = useState('');
  const [mention, setMention] = useState(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const textareaRef = useRef(null);
  const mentionRangeRef = useRef(null);
  const suggestionId = 'mention-suggestions';

  const suggestions = mention
    ? mentionOptions.filter(({ name }) => name.toLowerCase().includes(mention.query.toLowerCase()))
    : [];

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useImperativeHandle(
    ref,
    () => ({
      insertMention: (token) => {
        setText((prev) => {
          const base = prev.trimEnd();
          if (base.includes(token.trim())) return base;
          return base ? `${base} ${token}` : token;
        });
        setMention(null);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.selectionStart = el.selectionEnd = el.value.length;
        });
      },
    }),
    []
  );

  const insertSuggestion = (suggestion) => {
    const range = mentionRangeRef.current;
    if (!range) return;
    const suffix = text.slice(range.end);
    const separator = suffix.startsWith(' ') || suffix.startsWith('\n') ? '' : ' ';
    const next = `${text.slice(0, range.start)}@${suggestion.name}${separator}${suffix}`;
    const cursor = range.start + suggestion.name.length + 2;
    setText(next);
    setMention(null);
    mentionRangeRef.current = null;
    onTypingChange(next.trim().length > 0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = cursor;
    });
  };

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    setMention(null);
    onTypingChange(false);
  };

  const handleKeyDown = (event) => {
    if (mention && suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveSuggestion((current) => (current + direction + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        insertSuggestion(suggestions[activeSuggestion]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const handleChange = (event) => {
    const nextText = event.target.value;
    const cursor = event.target.selectionStart;
    setText(nextText);
    onTypingChange(nextText.trim().length > 0);

    const prefix = nextText.slice(0, cursor);
    const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
    if (!match) {
      setMention(null);
      mentionRangeRef.current = null;
      return;
    }

    const start = cursor - match[2].length - 1;
    const nextWhitespace = nextText.slice(cursor).search(/\s/);
    const end = nextWhitespace === -1 ? nextText.length : cursor + nextWhitespace;
    mentionRangeRef.current = { start, end };
    setMention({ query: match[2] });
    setActiveSuggestion(0);
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="composer-field">
        {mention && suggestions.length > 0 ? (
          <div
            className="mention-suggestions"
            id={suggestionId}
            role="listbox"
            aria-label="Mention someone"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.name}`}
                type="button"
                role="option"
                aria-selected={index === activeSuggestion}
                className={`mention-suggestion ${index === activeSuggestion ? 'mention-suggestion-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSuggestion(suggestion)}
              >
                <span
                  className={`avatar avatar-small ${suggestion.type === 'agent' ? 'avatar-agent' : ''}`}
                  aria-hidden="true"
                >
                  {initialsOf(suggestion.name)}
                </span>
                <span className="mention-suggestion-name">{suggestion.name}</span>
                <span className="mention-suggestion-type">
                  {suggestion.type === 'agent' ? 'AI agent' : 'Person'}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          value={text}
          placeholder={disabled ? 'Connecting…' : placeholder || 'Type a message…'}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => onTypingChange(false)}
          aria-autocomplete="list"
          aria-controls={mention ? suggestionId : undefined}
          aria-expanded={Boolean(mention && suggestions.length)}
          disabled={disabled}
          maxLength={2000}
        />
      </div>
      <button className="send-button" type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
});

export { TypingIndicator };
export default MessageComposer;
