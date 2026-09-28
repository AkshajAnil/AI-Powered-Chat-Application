import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api/client';
import { getSocket, teardownSocket } from '../socket/socket';
import { newClientId } from '../utils/format';

const mergeMessage = (list, incoming) => {
  if (!incoming?.id && !incoming?.clientId) return list;

  const byId = incoming.id ? list.findIndex((m) => m.id === incoming.id) : -1;
  if (byId !== -1) {
    const next = [...list];
    next[byId] = { ...next[byId], ...incoming, pending: false };
    return next;
  }

  if (incoming.clientId) {
    const byClientId = list.findIndex((m) => m.clientId === incoming.clientId);
    if (byClientId !== -1) {
      const next = [...list];
      next[byClientId] = { ...next[byClientId], ...incoming, pending: false };
      return next;
    }
  }

  return [...list, incoming].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

const TYPING_THROTTLE_MS = 1500;

export const useChat = (username) => {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(null);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );
  const typingRef = useRef({ active: false, lastSentAt: 0 });

  useEffect(() => {
    const handleVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const socket = getSocket();

    const handleConnect = () => {
      setConnection('connected');
      socket.emit('join', { username }, (ack) => {
        if (cancelled) return;
        if (!ack?.ok) setError(ack?.error?.message || 'Could not join the chat.');
      });
    };
    const handleDisconnect = () => {
      setConnection('disconnected');
      typingRef.current = { active: false, lastSentAt: 0 };
    };
    const handleConnectError = (err) => {
      setConnection('disconnected');
      setError(err?.message || 'Real-time connection failed.');
    };
    const handleNewMessage = (message) => setMessages((prev) => mergeMessage(prev, message));
    const handleStatus = ({ id, status }) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    const handlePresenceList = ({ onlineUsers: users }) => setOnlineUsers(users || []);
    const handlePresence = (update) => {
      if (Array.isArray(update?.onlineUsers)) setOnlineUsers(update.onlineUsers);
    };
    const handleTyping = ({ users }) =>
      setTypingUsers((users || []).filter((name) => name !== username));
    const handleServerError = (payload) => setError(payload?.message || 'Server error.');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleStatus);
    socket.on('presence:list', handlePresenceList);
    socket.on('presence:update', handlePresence);
    socket.on('typing:update', handleTyping);
    socket.on('chat:error', handleServerError);

    if (socket.connected) handleConnect();
    socket.connect();

    api
      .fetchMessages()
      .then((data) => {
        if (cancelled) return;
        setMessages((prev) => data.reduce((acc, message) => mergeMessage(acc, message), prev));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleStatus);
      socket.off('presence:list', handlePresenceList);
      socket.off('presence:update', handlePresence);
      socket.off('typing:update', handleTyping);
      socket.off('chat:error', handleServerError);
      teardownSocket();
    };
  }, [username]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const markRead = useCallback((ids) => {
    if (!ids?.length) return;
    getSocket().emit('message:read', { ids }, (ack) => {
      if (!ack?.ok || !ack.updatedIds?.length) return;
      setMessages((prev) =>
        prev.map((m) => (ack.updatedIds.includes(m.id) ? { ...m, status: 'read' } : m))
      );
    });
  }, []);

  useEffect(() => {
    if (connection !== 'connected' || !pageVisible) return undefined;
    const unreadIds = messages
      .filter((m) => m.author !== username && m.status !== 'read' && m.id && !m.id.startsWith('pending-'))
      .map((m) => m.id);
    if (unreadIds.length === 0) return undefined;
    const timer = setTimeout(() => markRead(unreadIds), 350);
    return () => clearTimeout(timer);
  }, [messages, connection, username, markRead, pageVisible]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const dispatchSend = useCallback((message) => {
    getSocket().emit('message:send', { text: message.text, clientId: message.clientId }, (ack) => {
      if (!ack?.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === message.clientId
              ? { ...m, status: 'failed', pending: false, error: ack?.error?.message }
              : m
          )
        );
        setError(ack?.error?.message || 'Message could not be sent.');
        return;
      }
      setMessages((prev) => mergeMessage(prev, ack.message));
    });
  }, []);

  const sendMessage = useCallback(
    (rawText) => {
      const text = rawText.trim();
      if (!text) return false;

      const clientId = newClientId();
      const optimistic = {
        id: `pending-${clientId}`,
        clientId,
        author: username,
        text,
        status: 'sending',
        pending: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      dispatchSend(optimistic);
      return true;
    },
    [username, dispatchSend]
  );

  const retryMessage = useCallback(
    (clientId) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, status: 'sending', pending: true, error: undefined } : m
        )
      );
      const target = messagesRef.current.find((m) => m.clientId === clientId);
      if (target) dispatchSend({ clientId, text: target.text });
    },
    [dispatchSend]
  );

  const notifyTyping = useCallback((isTyping) => {
    const socket = getSocket();
    const now = Date.now();
    const state = typingRef.current;

    if (isTyping) {
      if (state.active && now - state.lastSentAt < TYPING_THROTTLE_MS) return;
      typingRef.current = { active: true, lastSentAt: now };
      socket.emit('typing', { isTyping: true });
    } else if (state.active) {
      typingRef.current = { active: false, lastSentAt: 0 };
      socket.emit('typing', { isTyping: false });
    }
  }, []);

  return {
    messages,
    onlineUsers,
    typingUsers,
    connection,
    error,
    clearError: () => setError(null),
    sendMessage,
    retryMessage,
    notifyTyping,
  };
};
