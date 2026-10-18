import type { VaultPerson } from '../crypto/vault'

/**
 * What a household calls a member: the name its owner gave them, or else their
 * address. Written out in the member list and again for Belege's payers; one
 * rule, so a member cannot be named in one place and addressed in the other.
 */
export function memberName(people: Record<string, VaultPerson>, member: { user_id: number; email: string }): string {
  return people[String(member.user_id)]?.name ?? member.email
}
