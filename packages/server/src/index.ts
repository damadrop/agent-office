import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';

// Setup Express
const app = express();
app.use(express.json());

// ---- Private office: password gate ----
// Set OFFICE_PASSWORD env var to lock the office. Visitors without the
// password see only the login page.
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD || '';
const authToken = OFFICE_PASSWORD
    ? crypto.createHmac('sha256', OFFICE_PASSWORD).update('office-ok').digest('hex')
    : '';
function hasAuth(req: express.Request): boolean {
    if (!OFFICE_PASSWORD) return true;
    const cookies = req.headers.cookie || '';
    return cookies.split(';').some((c) => c.trim() === `office_auth=${authToken}`);
}
const LOGIN_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private Office</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14101f;color:#f5f0ff;font-family:system-ui,sans-serif}
.card{background:#221b33;border:1px solid #4a3b6b;border-radius:16px;padding:32px;width:min(92vw,340px);text-align:center;box-shadow:0 8px 40px #0008}
h1{font-size:20px;margin:0 0 6px} p{opacity:.7;font-size:14px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #4a3b6b;background:#14101f;color:#fff;font-size:16px;margin-bottom:12px}
button{width:100%;padding:12px;border:0;border-radius:10px;background:#e0559a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
.err{color:#ff7b7b;font-size:13px;min-height:18px;margin-bottom:8px}
</style></head><body><div class="card">
<h1>🔒 Private Office</h1><p>This office is invite-only. Enter the password to come in.</p>
<div class="err" id="err"></div>
<input type="password" id="pw" placeholder="Password" autocomplete="off">
<button onclick="go()">Enter</button></div>
<script>async function go(){const pw=document.getElementById('pw').value;
const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
if(r.ok){location.href='/';}else{document.getElementById('err').textContent='Wrong password. Try again.';}}
document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')go();});</script>
</body></html>`;
app.get('/login', (_req, res) => res.type('html').send(LOGIN_PAGE));
app.post('/api/login', (req, res) => {
    if (!OFFICE_PASSWORD) return res.json({ ok: true });
    if (req.body?.password === OFFICE_PASSWORD) {
        res.cookie('office_auth', authToken, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
        return res.json({ ok: true });
    }
    res.status(401).json({ ok: false });
});
app.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/api/login') return next();
    if (!hasAuth(req)) return res.redirect('/login');
    next();
});

// Basic REST API for Office Management
app.get('/api/offices', (req, res) => {
    res.json({ status: 'ok', offices: [] });
});

app.post('/api/vote-chaos', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    const { event, voterId } = req.body || {};
    const result = room.registerAudienceVote(event || 'server_outage', voterId);
    res.json({ ok: true, ...result });
});

app.get('/api/episode-recap', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    res.json({ ok: true, recap: room.getEpisodeRecap() });
});

// Create HTTP and Colyseus server
const httpServer = createServer(app);
const colyseusServer = new Server({
    server: httpServer,
});

// Define Rooms
colyseusServer.define('office', OfficeRoom);

// Serve the built UI (packages/ui/dist) from the same port so the whole
// office runs as a single service. API and Colyseus matchmake routes are
// excluded from the SPA fallback.
const uiDist = path.resolve(__dirname, '../../ui/dist');
app.use(express.static(uiDist));
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/matchmake')) return next();
    res.sendFile(path.join(uiDist, 'index.html'), (err) => {
        if (err) next();
    });
});

// Start listening
const PORT = Number(process.env.PORT || 3000);
colyseusServer.listen(PORT).then(() => {
    console.log(`[Server] AgentOffice Engine listening on ws://localhost:${PORT}`);
});
