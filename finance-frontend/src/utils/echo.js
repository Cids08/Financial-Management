import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { getToken } from './authToken'

// Reverb speaks the Pusher protocol, so laravel-echo's 'reverb' broadcaster
// still needs window.Pusher available  -  this is documented Echo/Reverb
// setup, not a leftover from an actual Pusher integration.
window.Pusher = Pusher

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const AUTH_ENDPOINT = `${BASE_URL}/api/broadcasting/auth`

// Reverb's WebSocket has to be reachable from the device actually running
// the app, not just from the dev machine that hosts the backend. When
// VITE_REVERB_HOST isn't set explicitly, target the same host the API is
// served from (LAN IP, public domain, ...) so any device that can use the
// API can also receive forced-logout broadcasts. localhost is only correct
// when the API itself is on localhost.
const REVERB_HOST =
  import.meta.env.VITE_REVERB_HOST ||
  (() => {
    try {
      return new URL(BASE_URL).hostname
    } catch {
      return 'localhost'
    }
  })()

// Default Echo/Pusher authorizer sends cookies (withCredentials), which
// works for Laravel's session-cookie SPA auth pattern  -  but this app uses
// a Sanctum Bearer token instead, so a custom authorizer is required to
// attach the Authorization header manually on every private-channel
// subscription request.
function bearerAuthorizer(channel) {
  return {
    authorize(socketId, callback) {
      fetch(AUTH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          socket_id: socketId,
          channel_name: channel.name,
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Channel auth failed: ${res.status}`)
          return res.json()
        })
        .then((data) => callback(false, data))
        .catch((err) => callback(true, err))
    },
  }
}

let echoInstance = null

// Created lazily, not at module load  -  the token doesn't exist yet on
// app boot for a logged-out visitor, and we don't want to open a socket
// connection before there's anyone to authenticate as.
export function getEcho() {
  if (echoInstance) return echoInstance

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: bearerAuthorizer,
  })

  return echoInstance
}

// Called from logout() so a stale socket connection (and its private
// channel subscription, tied to the now-invalid token) doesn't linger.
export function disconnectEcho() {
  if (echoInstance) {
    echoInstance.disconnect()
    echoInstance = null
  }
}