import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || undefined;

let socket = null;
let socketToken = null;

/**
 * Single shared Socket.io connection.
 * `autoConnect` is off so the caller can register listeners before connecting.
 */
export const getSocket = (token) => {
  if (!socket) {
    socketToken = token;
    socket = io(BASE_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 700,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });
  } else if (token && token !== socketToken) {
    socketToken = token;
    socket.auth = { token };
    if (socket.connected) socket.disconnect().connect();
  }
  return socket;
};

export const teardownSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
};
