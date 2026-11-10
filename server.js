const WebSocket = require('ws');
const http = require('http');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const Redis = require('ioredis');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

// Create HTTP server
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Custom Native Yjs Scalable Server Running\n');
});

// Setup WebSocket Server on port 1234
const wss = new WebSocket.Server({ noServer: true });

// Safe Redis client setup with error catching so it never crashes if Redis is offline
let redisPublisher = null;
let redisSubscriber = null;
const ROOM_NAME = 'collab-editor-room-v2';
const ydoc = new Y.Doc();
const awareness = new awarenessProtocol.Awareness(ydoc);

try {
  redisPublisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: () => null // Stop retrying if Redis is not installed/running locally
  });
  redisSubscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: () => null
  });

  redisPublisher.on('error', () => {}); // Suppress unhandled clutter
  redisSubscriber.on('error', () => {});

  redisSubscriber.subscribe(ROOM_NAME, (err) => {
    if (!err) {
      console.log(`✅ Connected to Redis Pub/Sub, subscribed to channel: ${ROOM_NAME}`);
    }
  });

  redisSubscriber.on('message', (channel, message) => {
    if (channel === ROOM_NAME) {
      const update = new Uint8Array(message);
      Y.applyUpdate(ydoc, update, 'redis');
    }
  });

  ydoc.on('update', (update, origin) => {
    if (origin !== 'redis' && redisPublisher) {
      redisPublisher.publish(ROOM_NAME, Buffer.from(update)).catch(() => {});
    }
  });
} catch (e) {
  console.log('ℹ️ Running in standalone memory mode (Redis offline)');
}

wss.on('connection', (ws) => {
  const connId = Math.random();
  console.log(`🔌 New client connected (${connId})`);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  ws.send(encoding.toUint8Array(encoder));

  ws.on('message', (message) => {
    try {
      const pub = new Uint8Array(message);
      const decoder = decoding.createDecoder(pub);
      if (!decoding.hasContent(decoder)) return;
      const messageType = decoding.readVarUint(decoder);

      const replyEncoder = encoding.createEncoder();
      encoding.writeVarUint(replyEncoder, 0);

      if (messageType === 0) {
        syncProtocol.readSyncMessage(decoder, replyEncoder, ydoc, ws);
        if (encoding.length(replyEncoder) > 1) {
          ws.send(encoding.toUint8Array(replyEncoder));
        }
      } else if (messageType === 1) {
        const awarenessUpdate = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, ws);
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Client disconnected (${connId})`);
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 1234;
server.listen(PORT, () => {
  console.log(`🚀 Custom Yjs Server running smoothly on port ${PORT}`);
});