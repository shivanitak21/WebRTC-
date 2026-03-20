const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const routes = {
    '/':         'sender.html',
    '/sender':   'sender.html',
    '/viewer':   'viewer.html',
  };
  const file = routes[req.url] || null;
  if (file) {
    res.writeHead(200, {
    'Content-Type': 'text/html',
    'ngrok-skip-browser-warning': 'true',
    'Access-Control-Allow-Origin': '*'
    });
    res.end(fs.readFileSync(path.join(__dirname, file)));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false
});

// Store connected clients by role
const clients = { sender: null, viewer: null };

wss.on('connection', (ws) => {
  console.log('[server] new connection');

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    console.log('[server] received:', msg.type, 'from', msg.role || '?');

    // Register role
    if (msg.type === 'register') {
      clients[msg.role] = ws;
      ws.role = msg.role;
      console.log(`[server] registered as ${msg.role}`);

      // Tell sender if viewer just joined
      if (msg.role === 'viewer' && clients.sender) {
        clients.sender.send(JSON.stringify({ type: 'viewer-joined' }));
      }
      // Tell viewer if sender is already present
      if (msg.role === 'viewer') {
        ws.send(JSON.stringify({ type: 'server-status', senderReady: !!clients.sender }));
      }
      return;
    }

    // Relay signalling messages between sender <-> viewer
    const target = ws.role === 'sender' ? clients.viewer : clients.sender;
    if (target && target.readyState === 1) {
      target.send(raw.toString());
    } else {
      console.log('[server] target not connected, dropping:', msg.type);
    }
  });

  ws.on('close', () => {
    if (ws.role) {
      clients[ws.role] = null;
      console.log(`[server] ${ws.role} disconnected`);
      const other = ws.role === 'sender' ? clients.viewer : clients.sender;
      if (other) other.send(JSON.stringify({ type: 'peer-disconnected' }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅  Server running on port ${PORT}\n`);
});

const RENDER_URL = 'https://webrtc-01rl.onrender.com';

if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    require('https').get(RENDER_URL, (res) => {
      console.log('Keep-alive ping:', res.statusCode);
    }).on('error', (err) => {
      console.log('Ping error:', err.message);
    });
  }, 14 * 60 * 1000);
}