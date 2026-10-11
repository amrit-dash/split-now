/**
 * Which actions the admin console's account list offers on a row (src/pages/admin/Users.tsx).
 * The adminSetAdmin and adminBlockUser callables enforce the same rules; this keeps the list from
 * offering a button that can only fail.
 */
export interface UserRowState {
  uid: string
  admin: boolean
  blocked: boolean
  /** a guest (live tables): no sign-in method, never a profile, so never an admin */
  guest?: boolean
}

export type UserAction = 'make-admin' | 'remove-admin' | 'block' | 'unblock'

export function userRowActions(u: UserRowState, me: string): UserAction[] {
  // Nothing on your own row: no blocking yourself, no removing your own access.
  if (u.uid === me) return []
  // An admin can't be blocked; their access comes off first.
  if (u.admin) return ['remove-admin']
  if (u.blocked) return ['unblock']
  return u.guest ? ['block'] : ['make-admin', 'block']
}
