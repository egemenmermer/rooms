import { StoatError } from '@rooms/stoat';
/** Stoat flags and precedence follow upstream core/permissions, not Discord permissions. */
export const StoatPermissions = {
  VIEW_CHANNEL: 1n << 20n,
  READ_HISTORY: 1n << 21n,
  CONNECT: 1n << 30n,
  SPEAK: 1n << 31n,
  VIDEO: 1n << 32n,
  MOVE_MEMBERS: 1n << 35n,
  LISTEN: 1n << 36n,
  ALL: (1n << 52n) - 1n,
};
export interface PermissionOverride {
  a?: number | string;
  d?: number | string;
  allow?: number | string;
  deny?: number | string;
}
export interface StoatRole {
  rank: number;
  permissions: PermissionOverride;
}
export interface StoatServer {
  _id: string;
  owner: string;
  default_permissions: number | string;
  roles?: Record<string, StoatRole>;
}
export interface StoatMember {
  _id: { server: string; user: string };
  roles?: string[];
  timeout?: string;
  can_publish?: boolean;
  can_receive?: boolean;
}
export interface StoatChannel {
  _id: string;
  server?: string;
  channel_type: string;
  voice?: unknown;
  default_permissions?: PermissionOverride;
  role_permissions?: Record<string, PermissionOverride>;
}
const value = (v: number | string | undefined) => {
  if (v === undefined) return 0n;
  if (
    (typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0)) ||
    (typeof v === 'string' && !/^(0|[1-9][0-9]{0,15})$/.test(v)) ||
    (typeof v !== 'number' && typeof v !== 'string')
  )
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  const result = BigInt(v);
  if (result < 0n || result > StoatPermissions.ALL)
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  return result;
};
const overrideBits = (override: PermissionOverride | undefined) => {
  if (override === undefined || override === null) return { a: 0n, d: 0n };
  if (typeof override !== 'object' || Array.isArray(override))
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  return { a: value(override.a ?? override.allow), d: value(override.d ?? override.deny) };
};
const apply = (permissions: bigint, override: PermissionOverride | undefined) => {
  const bits = overrideBits(override);
  return (permissions | bits.a) & ~bits.d;
};
function calculatePermissions(
  server: StoatServer,
  channel: StoatChannel,
  member: StoatMember,
  userId: string,
  now = Date.now(),
): bigint {
  if (
    channel.channel_type !== 'TextChannel' ||
    !member?._id ||
    channel.server !== server._id ||
    member._id.server !== server._id ||
    member._id.user !== userId
  )
    return 0n;
  if (server.owner === userId) return StoatPermissions.ALL;
  if (
    member.roles !== undefined &&
    (!Array.isArray(member.roles) || member.roles.some((role) => typeof role !== 'string'))
  )
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  if (
    member.timeout !== undefined &&
    (typeof member.timeout !== 'string' || !Number.isFinite(Date.parse(member.timeout)))
  )
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  let permissions = apply(value(server.default_permissions), channel.default_permissions);
  const selected = new Set(member.roles ?? []);
  const applyRanked = (entries: { rank: number; permissions: PermissionOverride }[]) => {
    const groups = new Map<number, { a: bigint; d: bigint }>();
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.rank))
        throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
      const group = groups.get(entry.rank) ?? { a: 0n, d: 0n };
      const bits = overrideBits(entry.permissions);
      group.a |= bits.a;
      group.d |= bits.d;
      groups.set(entry.rank, group);
    }
    // Equal-ranked conflicting overrides are ambiguous upstream HashMap order. Fail closed with deny precedence.
    for (const [, group] of [...groups].sort((a, b) => b[0] - a[0]))
      permissions = (permissions | group.a) & ~group.d;
  };
  applyRanked(
    Object.entries(server.roles ?? {})
      .filter(([id]) => selected.has(id))
      .map(([, role]) => role),
  );
  applyRanked(
    Object.entries(channel.role_permissions ?? {})
      .filter(([id]) => selected.has(id) && !!server.roles?.[id])
      .map(([id, override]) => ({ rank: server.roles![id].rank, permissions: override })),
  );
  if (
    (member.can_publish !== undefined && typeof member.can_publish !== 'boolean') ||
    (member.can_receive !== undefined && typeof member.can_receive !== 'boolean')
  )
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  if (member.can_publish === false)
    permissions &= ~(StoatPermissions.SPEAK | StoatPermissions.VIDEO);
  if (member.can_receive === false) permissions &= ~StoatPermissions.LISTEN;
  if (member.timeout && Date.parse(member.timeout) > now)
    permissions &= StoatPermissions.VIEW_CHANNEL | StoatPermissions.READ_HISTORY;
  if (!(permissions & StoatPermissions.VIEW_CHANNEL)) return 0n;
  return permissions;
}

/** Pure authorization data errors must revoke existing grants as well as reject new ones. */
export function stoatChannelPermissions(
  server: StoatServer,
  channel: StoatChannel,
  member: StoatMember,
  userId: string,
  now = Date.now(),
): bigint {
  try {
    return calculatePermissions(server, channel, member, userId, now);
  } catch {
    throw new StoatError(403, 'INVALID_PERMISSION_CONTEXT');
  }
}
