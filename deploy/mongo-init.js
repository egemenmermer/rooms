// Runs once, when the database volume is first created. Passwords come from the
// container environment; nothing is printed.
const env = process.env;
db.getSiblingDB('admin').createUser({
  user: 'rooms_stoat',
  pwd: env.ROOMS_MONGO_STOAT_PASSWORD,
  roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }],
});
const revolt = db.getSiblingDB('revolt');
// The access broker and admin tool may only add account invitations.
revolt.createRole({
  role: 'roomsInviteInsert',
  privileges: [{ resource: { db: 'revolt', collection: 'account_invites' }, actions: ['insert'] }],
  roles: [],
});
revolt.createUser({
  user: 'rooms_inviter',
  pwd: env.ROOMS_MONGO_INVITER_PASSWORD,
  roles: ['roomsInviteInsert'],
});
// Live voice/activity authorization reads community structure only.
revolt.createRole({
  role: 'roomsAuthRead',
  privileges: ['channels', 'servers', 'server_members'].map((collection) => ({
    resource: { db: 'revolt', collection },
    actions: ['find'],
  })),
  roles: [],
});
revolt.createUser({
  user: 'rooms_reader',
  pwd: env.ROOMS_MONGO_READER_PASSWORD,
  roles: ['roomsAuthRead'],
});
