/**
 * Who may be made an admin, or stop being one, from the admin console (adminSetAdmin). Pure, so
 * the rules of it are tested without the emulator.
 */
export interface AdminChange {
  /** The admin making the change. */
  me: string
  uid: string
  makeAdmin: boolean
  /** admins/{uid} exists now. */
  isAdmin: boolean
  /** users/{uid} exists: a real account that has used the app (live-table guests never have one). */
  hasProfile: boolean
  /** blocked/{uid} exists. */
  blocked: boolean
}

/** The reason a change is refused, or null when it may go ahead. Making an admin who already is one (or removing one who isn't) is allowed and changes nothing. */
export function adminChangeRefusal(c: AdminChange): string | null {
  if (c.makeAdmin) {
    if (c.isAdmin) return null
    if (c.blocked) return 'Unblock them first'
    if (!c.hasProfile) return 'They need to sign in to Split Now once first'
    return null
  }
  // Removing your own access could leave nobody able to reach the console.
  if (c.uid === c.me) return 'You can’t remove your own admin access'
  return null
}
