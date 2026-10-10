// proxy-socket-hook.js — route non-local TCP through the egress HTTP CONNECT
// proxy. Loaded via NODE_OPTIONS=--require. Localhost stays direct.
// The caller's 'connect' fires only after the CONNECT tunnel is established;
// handshake bytes never leak to the caller.
'use strict';
const net = require('net');

function getProxy() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const auth = u.username
      ? 'Basic ' + Buffer.from(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password)).toString('base64')
      : null;
    return { host: u.hostname, port: parseInt(u.port || '3128', 10), auth };
  } catch { return null; }
}
const proxy = getProxy();

function isLocal(host) {
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  // Never tunnel the proxy itself (clients like axios already route via env proxy)
  if (proxy && (host === proxy.host || host.endsWith('.' + proxy.host))) return true;
  return false;
}

function normalizeArgs(args) {
  const options = {};
  let cb = null;
  for (const a of args) {
    if (typeof a === 'function') cb = a;
    else if (typeof a === 'number') options.port = a;
    else if (typeof a === 'string') options.host = a;
    else if (a && typeof a === 'object') Object.assign(options, a);
  }
  return { options, cb };
}

function connectViaProxy(options, userCb) {
  const targetHost = options.host || 'localhost';
  const targetPort = options.port;
  const sock = new net.Socket();
  sock.pause(); // hold all data until the tunnel is up

  const origEmit = sock.emit.bind(sock);
  let handshakeDone = false;

  const finishOk = (rest) => {
    handshakeDone = true;
    if (rest && rest.length) sock.unshift(rest);
    sock.resume();
    origEmit('connect');
    if (userCb) userCb();
  };
  const finishErr = (msg) => {
    handshakeDone = true;
    const err = new Error(msg);
    err.code = 'ECONNREFUSED';
    sock.resume();
    origEmit('error', err);
    sock.destroy();
  };

  const doHandshake = () => {
    let req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
    if (proxy.auth) req += `Proxy-Authorization: ${proxy.auth}\r\n`;
    req += `Proxy-Connection: Keep-Alive\r\n\r\n`;
    let buf = Buffer.alloc(0);
    const onReadable = () => {
      let chunk;
      while ((chunk = sock.read()) !== null) buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      sock.removeListener('readable', onReadable);
      const head = buf.slice(0, idx).toString('latin1');
      const rest = buf.slice(idx + 4);
      if (!/^HTTP\/1\.[01] 200/i.test(head)) {
        finishErr(`proxy CONNECT to ${targetHost}:${targetPort} failed: ${head.split('\r\n')[0]}`);
        return;
      }
      finishOk(rest);
    };
    sock.on('readable', onReadable);
    sock.write(req);
  };

  // Swallow the premature 'connect' from the proxy TCP leg; the caller only
  // sees 'connect' once the tunnel is truly established.
  sock.emit = function (ev, ...a) {
    if (ev === 'connect' && !handshakeDone) { doHandshake(); return false; }
    return origEmit(ev, ...a);
  };

  sock.connect(proxy.port, proxy.host);
  return sock;
}

const origConnect = net.connect;
function patched(...args) {
  const { options, cb } = normalizeArgs(args);
  if (!proxy || isLocal(options.host)) return origConnect.apply(this, args);
  return connectViaProxy(options, cb);
}
net.connect = patched;
net.createConnection = patched;
