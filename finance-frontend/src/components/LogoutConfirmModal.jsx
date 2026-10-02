import { LogOut } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { useAuth } from '../hooks/useAuth'

export default function LogoutConfirmModal({ open, onClose }) {
  const { logout } = useAuth()

  const confirmLogout = () => {
    onClose()
    // Centralized logout  -  revokes the Sanctum token server-side,
    // disconnects the websocket, clears the local token, and navigates
    // with the authNotice so the login screen can explain the exit.
    logout('manual')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Out"
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="md" icon={LogOut} onClick={confirmLogout}>
            Log Out
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        Are you sure you want to log out? You'll need to sign in again to access your account.
      </p>
    </Modal>
  )
}