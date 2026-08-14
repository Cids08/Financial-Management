import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

export function useRoles() {
  const [roles, setRoles] = useState([])
  const [archivedRoles, setArchivedRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState(null)

  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [actionBusyId, setActionBusyId] = useState(null)

  const [permissions, setPermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [permissionsError, setPermissionsError] = useState(null)

  const [permSaving, setPermSaving] = useState(false)
  const [permError, setPermError] = useState(null)

  // Fetches both the active and archived lists together — a role only
  // ever needs to move between them (on archive/restore), never be
  // partially stale in one while the other refreshes.
  const fetchRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError(null)
    try {
      const [activeRes, archivedRes] = await Promise.all([
        apiFetch('/api/roles'),
        apiFetch('/api/roles?archived=1'),
      ])
      const [activeJson, archivedJson] = await Promise.all([activeRes.json(), archivedRes.json()])

      if (!activeRes.ok || !activeJson.success) throw new Error(activeJson.message || 'Failed to load roles.')
      if (!archivedRes.ok || !archivedJson.success) throw new Error(archivedJson.message || 'Failed to load archived roles.')

      setRoles(activeJson.data)
      setArchivedRoles(archivedJson.data)
    } catch (err) {
      setRolesError(err.message)
    } finally {
      setRolesLoading(false)
    }
  }, [])

  const fetchPermissions = useCallback(async () => {
    setPermissionsLoading(true)
    setPermissionsError(null)
    try {
      const res = await apiFetch('/api/permissions')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load permissions.')
      setPermissions(json.data)
    } catch (err) {
      setPermissionsError(err.message)
    } finally {
      setPermissionsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoles()
    fetchPermissions()
  }, [fetchRoles, fetchPermissions])

  // Fetches a single role WITH its permissionIds populated — the list
  // endpoint deliberately omits that to avoid an N+1 join on every row.
  const fetchRoleWithPermissions = useCallback(async (roleId) => {
    setPermError(null)
    try {
      const res = await apiFetch(`/api/roles/${roleId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load role permissions.')
      return { success: true, role: json.data }
    } catch (err) {
      setPermError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const updateRolePermissions = useCallback(async (roleId, permissionIds) => {
    setPermSaving(true)
    setPermError(null)
    try {
      const res = await apiFetch(`/api/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_ids: permissionIds }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update permissions.')
      await fetchRoles()
      return { success: true }
    } catch (err) {
      setPermError(err.message)
      return { success: false, message: err.message }
    } finally {
      setPermSaving(false)
    }
  }, [fetchRoles])

  const createRole = useCallback(async (fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add role.')
      await fetchRoles()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [fetchRoles])

  const updateRole = useCallback(async (roleId, fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch(`/api/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update role.')
      await fetchRoles()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [fetchRoles])

  // Named archiveRole (not deleteRole) to match the reality of what the
  // backend does — DELETE /api/roles/{id} is a soft delete, same as
  // archiveUser. The HTTP method is historical; the behavior is archive.
  const archiveRole = useCallback(async (roleId) => {
    setDeleteBusy(true)
    setActionBusyId(roleId)
    setDeleteError(null)
    try {
      const res = await apiFetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive role.')
      await fetchRoles()
      return { success: true }
    } catch (err) {
      setDeleteError(err.message)
      return { success: false, message: err.message }
    } finally {
      setDeleteBusy(false)
      setActionBusyId(null)
    }
  }, [fetchRoles])

  const restoreRole = useCallback(async (roleId) => {
    setActionBusyId(roleId)
    setDeleteError(null)
    try {
      const res = await apiFetch(`/api/roles/${roleId}/restore`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore role.')
      await fetchRoles()
      return { success: true }
    } catch (err) {
      setDeleteError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchRoles])

  return {
    roles,
    archivedRoles,
    rolesLoading,
    rolesError,
    formSaving,
    formError,
    deleteBusy,
    deleteError,
    actionBusyId,
    permissions,
    permissionsLoading,
    permissionsError,
    permSaving,
    permError,
    createRole,
    updateRole,
    archiveRole,
    restoreRole,
    fetchRoleWithPermissions,
    updateRolePermissions,
    refetch: fetchRoles,
  }
}