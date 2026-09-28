const DAY_MS = 24 * 60 * 60 * 1000;

export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const formatDayLabel = (iso) => {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const stamp = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (stamp === startOfToday) return 'Today';
  if (stamp === startOfToday - DAY_MS) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export const initialsOf = (name = '?') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

export const groupByDay = (messages = []) =>
  messages.reduce((groups, message) => {
    const label = formatDayLabel(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(message);
    else groups.push({ label, items: [message] });
    return groups;
  }, []);

export const formatUserList = (users = []) => {
  if (users.length === 0) return '';
  if (users.length === 1) return users[0];
  if (users.length === 2) return `${users[0]} and ${users[1]}`;
  return `${users.slice(0, -1).join(', ')} and ${users[users.length - 1]}`;
};

export const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
