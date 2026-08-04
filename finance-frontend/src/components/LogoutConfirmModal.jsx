import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { clearToken } from '../utils/authToken'

export default function LogoutConfirmModal({ open, onClose }) {
  const navigate = useNavigate()

  const confirmLogout = () => {
    clearToken()
    onClose()
    navigate('/logout')
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