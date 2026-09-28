import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || undefined;

let socket = null;

/**
 * Single shared Socket.io connection.
 * `autoConnect` is off so the caller can register listeners before connecting.
 */
export const getSocket = () => {
  if (!socket) {
    socket = io(BASE_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 700,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
};

export const teardownSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};
