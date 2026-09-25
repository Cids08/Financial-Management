import { apiFetch } from './api'

/**
 * Push notification helpers for the Notifications page.
 *
 * Flow:
 *   1. GET  /api/notifications/vapid-key -> { vapid_public_key }
 *   2. Notification.requestPermission()   -> granted/denied/default
 *   3. pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 *   4. POST /api/notifications/subscribe  -> persist { endpoint, keys } server-side
 */

export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export async function fetchVapidKey() {
  const res = await apiFetch('/api/notifications/vapid-key')
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.message || 'Could not load push settings.')
  return json.data || {}
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported by this browser.')
  }
  const reg = await navigator.serviceWorker.ready
  return reg
}

/** Returns whether the current browser already has a server-saved subscription. */
export async function getBrowserSubscriptionState() {
  try {
    const reg = await getRegistration()
    const sub = await reg.pushManager.getSubscription()
    return sub ? { subscribed: true, endpoint: sub.endpoint } : { subscribed: false, endpoint: null }
  } catch {
    return { subscribed: false, endpoint: null }
  }
}

// Mirrors PrivacyContext's default: privacy is ON unless explicitly off.
function privacyPref() {
  try {
    return localStorage.getItem('privacyMode') !== 'off'
  } catch {
    return true
  }
}

export async function enablePush() {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const { vapid_public_key: vapidKey, push_enabled: pushEnabled } = await fetchVapidKey()
  if (!pushEnabled || !vapidKey) {
    throw new Error('Push is not configured on the server (VAPID keys missing).')
  }

  const reg = await getRegistration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  const body = sub.toJSON()
  const res = await apiFetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: body.endpoint, keys: body.keys, privacy_mode: privacyPref() }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save push subscription.')

  return { subscribed: true, endpoint: body.endpoint }
}

/**
 * Push the current Privacy Mode to the server for this browser's
 * subscription so OS toasts get redacted/restored without re-subscribing.
 * Fire-and-forget — privacy masking in the UI never depends on this.
 */
export async function syncPushPrivacy(privacyOn) {
  try {
    const { subscribed, endpoint } = await getBrowserSubscriptionState()
    if (!subscribed || !endpoint) return false
    const res = await apiFetch('/api/notifications/subscribe', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, privacy_mode: Boolean(privacyOn) }),
    })
    const json = await res.json()
    return Boolean(res.ok && json.success)
  } catch {
    return false
  }
}

export async function disablePush() {
  let endpoint = null

  try {
    const reg = await getRegistration()
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      endpoint = sub.endpoint
      await sub.unsubscribe()
    }
  } catch {
    // Even if the browser-side unsubscribe fails, still try to remove the
    // server-side record so we never push to a dead endpoint.
  }

  if (endpoint) {
    try {
      await apiFetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    } catch {
      // Best-effort server cleanup.
    }
  }

  return { subscribed: false, endpoint: null }
}