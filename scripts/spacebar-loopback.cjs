// Local launcher network policy. Upstream source stays byte-for-byte unchanged.
// Bundle uses server.listen({ port }) with no configurable host. Restrict all
// native development Node TCP listeners to loopback before upstream starts.
const net = require('node:net');
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === 'object' && 'port' in args[0]) args[0] = { ...args[0], host: '127.0.0.1' };
  else if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
  }
  return original.apply(this, args);
};
