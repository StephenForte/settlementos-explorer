import { roleLabel, type AddressRole } from '../config/address-book'

export function RoleBadge({ role }: { role: AddressRole }) {
  return <span className={`role-badge role-${role}`}>{roleLabel(role)}</span>
}
