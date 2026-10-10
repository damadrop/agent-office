// lt-driver.js — localtunnel client that works behind the egress proxy.
// usage: node lt-driver.js <localPort> [logfile]
// 1. Gets a tunnel assignment via native fetch (proxy-aware).
// 2. Runs localtunnel's TunnelCluster for the TCP data path, with raw TCP
//    routed through the proxy via proxy-socket-hook.js.
'use strict';
require('/home/hatch/workspace/agent-office/bin/proxy-socket-hook.js');
const TunnelCluster = require('/home/hatch/.npm/_npx/75ac80b86e83d4a2/node_modules/localtunnel/lib/TunnelCluster');

async function main() {
  const localPort = parseInt(process.argv[2], 10);
  if (!localPort) throw new Error('usage: node lt-driver.js <localPort>');
  const apiUrl = 'https://localtunnel.me/?new';
  const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('tunnel API failed: HTTP ' + res.status);
  const body = await res.json();
  const info = {
    name: body.id,
    url: body.url,
    max_conn: body.max_conn_count || 1,
    remote_host: 'localtunnel.me',
    remote_ip: body.ip,
    remote_port: body.port,
    local_port: localPort,
    local_host: '127.0.0.1',
  };
  console.log('TUNNEL_URL=' + info.url);
  const cluster = new TunnelCluster(info);
  cluster.on('error', (e) => console.error('[tunnel error]', e.message));
  cluster.on('dead', () => {
    console.error('[tunnel dead] reopening...');
    setTimeout(() => { if (!cluster.destroyed) cluster.open(); }, 2000);
  });
  cluster.on('open', () => console.log('[tunnel] connection open for ' + info.url));
  cluster.on('request', (req) => console.log('[tunnel] request', req.method, req.path));
  for (let i = 0; i < info.max_conn; i++) cluster.open();
  setInterval(() => {}, 60000); // keep alive
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
