import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { formatUserList } from '../utils/format';

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
  { onSend, onTypingChange, disabled, placeholder },
  ref
) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

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

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
    onTypingChange(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const handleChange = (event) => {
    setText(event.target.value);
    onTypingChange(event.target.value.trim().length > 0);
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        className="composer-input"
        rows={1}
        value={text}
        placeholder={disabled ? 'Connecting…' : placeholder || 'Type a message…'}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => onTypingChange(false)}
        disabled={disabled}
        maxLength={2000}
      />
      <button className="send-button" type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
});

export { TypingIndicator };
export default MessageComposer;
