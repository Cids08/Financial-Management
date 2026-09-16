import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onTokenReplacedByOtherTab,
  claimCurrentToken,
  markTabEvicted,
} from '../utils/authToken'
import { disconnectEcho } from '../utils/echo'

// Enforces "only the tab that logged in most recently stays active."
// localStorage is shared across every tab of the browser, so when tab 2
// logs in as a different user, the shared token silently becomes tab 2's
// -  without this guard tab 1 would keep firing API calls using tab 2's
// credentials (mixing two users' data in one browser). This listens for
// that storage change and boots the superseded tab back to the login page.
//
// Mounted once, globally, in App.jsx (inside BrowserRouter  -  it needs
// useNavigate), alongside AuthExpiredListener. Must run on the public
// login screen too, since the superseded tab lands there.
export default function SingleTabSessionGuard() {
  const navigate = useNavigate()
  const evictedRef = useRef(false)

  useEffect(() => {
    // Pick up the current shared token as "this tab's" so duplicated /
    // late-opened tabs are tracked too, not just the tab that logged in.
    claimCurrentToken()

    const unsubscribe = onTokenReplacedByOtherTab(() => {
      if (evictedRef.current) return
      evictedRef.current = true

      disconnectEcho()
      markTabEvicted()
      navigate('/', { replace: true, state: { authNotice: 'signedOutElsewhere' } })
    })

    return unsubscribe
  }, [navigate])

  return null
}