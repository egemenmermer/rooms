export const Permissions = {
  VIEW_CHANNEL: 1n << 10n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  STREAM: 1n << 9n,
  ADMINISTRATOR: 1n << 3n,
};
export interface Role {
  id: string;
  permissions: string;
}
export interface Overwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}
export function effectivePermissions(input: {
  userId: string;
  guildId: string;
  ownerId?: string;
  memberRoles: string[];
  roles: Role[];
  overwrites: Overwrite[];
}): bigint {
  if (input.userId === input.ownerId) return (1n << 64n) - 1n;
  const roleIds = new Set([input.guildId, ...input.memberRoles]);
  let permissions = input.roles
    .filter((r) => roleIds.has(r.id))
    .reduce((p, r) => p | BigInt(r.permissions), 0n);
  if (permissions & Permissions.ADMINISTRATOR) return (1n << 64n) - 1n;
  const everyone = input.overwrites.find((o) => o.id === input.guildId && o.type === 0);
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let deny = 0n;
  let allow = 0n;
  for (const overwrite of input.overwrites) {
    if (overwrite.type === 0 && overwrite.id !== input.guildId && roleIds.has(overwrite.id)) {
      deny |= BigInt(overwrite.deny);
      allow |= BigInt(overwrite.allow);
    }
  }
  permissions = (permissions & ~deny) | allow;
  const member = input.overwrites.find((o) => o.id === input.userId && o.type === 1);
  if (member) permissions = (permissions & ~BigInt(member.deny)) | BigInt(member.allow);
  return permissions;
}
