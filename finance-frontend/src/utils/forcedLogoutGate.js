/**
 * Shared flag so AuthExpiredListener can hold off on its 401-driven
 * redirect while the ForcedLogout modal is already on screen explaining a
 * server-initiated sign-out.
 *
 * Without this, the two mechanisms race: a same-account login elsewhere
 * revokes this tab's token AND broadcasts ForcedLogout at the same time, so
 * the modal appears for a split second, then the first 401-failing request
 * fires 'auth:expired', AuthExpiredListener navigates to / , and the modal
 * unmounts with the authenticated layout.
 */

let forcedLogoutVisible = false

export function setForcedLogoutVisible(visible) {
  forcedLogoutVisible = visible
}

export function isForcedLogoutVisible() {
  return forcedLogoutVisible
}