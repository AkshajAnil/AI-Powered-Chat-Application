const BASE_URL = import.meta.env.VITE_API_URL || '';
const API_ROOT = `${BASE_URL}/api`;

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const request = async (path, { method = 'GET', body, signal } = {}) => {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError('Cannot reach the chat server. Is the backend running?', 0, { cause: err });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error?.message || `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }
  return payload.data;
};

export const api = {
  login: (username) => request('/auth/login', { method: 'POST', body: { username } }),
  fetchMessages: ({ limit = 100, before } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return request(`/messages?${params.toString()}`);
  },
  sendMessage: (payload) => request('/messages', { method: 'POST', body: payload }),
  fetchOnlineUsers: () => request('/users/online'),
  fetchAgents: () => request('/agents'),
};

export { ApiError };
