// Thin re-export so every existing `import { useProfile } from
// '../hooks/useProfile'` (Header.jsx, Profile.jsx, etc.) keeps working
// unchanged. The actual fetch/state now lives once in ProfileContext —
// see src/context/ProfileContext.jsx — instead of being duplicated per
// component, which was causing Header and Profile to show out-of-sync
// avatars.
export { useProfileContext as useProfile } from '../context/ProfileContext'