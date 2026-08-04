import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backend note: the `users` table soft-deletes (deleted_at), it doesn't
 * have a boolean `is_archived` column. GET /api/users?archived=1 returns
 * ONLY trashed rows, and the default (no param) returns only non-trashed
 * rows — it's either/or, not a combined list. So this hook keeps two
 * separate arrays (active + archived) and refetches both together after
 * any mutation, rather than trying to filter one combined list
 * client-side the way the old dummy-data version did.
 */
export function useUsers() {
  const [users, setUsers] = useState([])
  const [archivedUsers, setArchivedUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState(null)

  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState(null)

  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [actionBusyId, setActionBusyId] = useState(null)

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const [activeRes, archivedRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/users?archived=1'),
      ])
      const activeJson = await activeRes.json()
      const archivedJson = await archivedRes.json()

      if (!activeRes.ok || !activeJson.success) {
        throw new Error(activeJson.message || 'Failed to load users.')
      }
      if (!archivedRes.ok || !archivedJson.success) {
        throw new Error(archivedJson.message || 'Failed to load archived users.')
      }

      setUsers(activeJson.data)
      setArchivedUsers(archivedJson.data)
    } catch (err) {
      setUsersError(err.message)
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError(null)
    try {
      const res = await apiFetch('/api/roles')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load roles.')
      setRoles(json.data)
    } catch (err) {
      setRolesError(err.message)
    } finally {
      setRolesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [fetchUsers, fetchRoles])

  const createUser = useCallback(async (fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add user.')
      await fetchUsers()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [fetchUsers])

  const updateUser = useCallback(async (userId, fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update user.')
      await fetchUsers()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [fetchUsers])

  const archiveUser = useCallback(async (userId) => {
    setActionBusyId(userId)
    setUsersError(null)
    try {
      const res = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive user.')
      await fetchUsers()
      return { success: true }
    } catch (err) {
      setUsersError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchUsers])

  const restoreUser = useCallback(async (userId) => {
    setActionBusyId(userId)
    setUsersError(null)
    try {
      const res = await apiFetch(`/api/users/${userId}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore user.')
      await fetchUsers()
      return { success: true }
    } catch (err) {
      setUsersError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchUsers])

  return {
    users,
    archivedUsers,
    usersLoading,
    usersError,
    roles,
    rolesLoading,
    rolesError,
    formSaving,
    formError,
    actionBusyId,
    createUser,
    updateUser,
    archiveUser,
    restoreUser,
    refetch: fetchUsers,
  }
}