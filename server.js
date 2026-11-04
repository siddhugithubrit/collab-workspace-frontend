require('dotenv').config({path:'C:\\Users\\ADMIN\\collab-workspace\\prisma\\.env'});
const WebSocket = require('ws');
const Redis = require('ioredis');

const redisConfig = {
  tls: {
    rejectUnauthorized: false
  }
};

const redisPub = new Redis(process.env.REDIS_URL, redisConfig);
const redisSub = new Redis(process.env.REDIS_URL, redisConfig);

const CHANNEL = 'collab-editor-room-v2';

const wss = new WebSocket.Server({ port: 1234 });

console.log('WebSocket server running on ws://localhost:1234 with Redis Pub/Sub');

redisSub.subscribe(CHANNEL, (err, count) => {
  if (err) {
    console.error('Failed to subscribe to Redis channel:', err);
  } else {
    console.log(`Subscribed successfully to Redis channel: ${CHANNEL}`);
  }
});

const clients = new Map();

redisSub.on('message', (channel, messageString) => {
  if (channel === CHANNEL) {
    try {
      const data = JSON.parse(messageString);
      const senderId = data.senderId;
      const bufferData = Buffer.from(data.payload, 'base64');

      clients.forEach((client, ws) => {
        if (ws.id !== senderId && ws.readyState === WebSocket.OPEN) {
          ws.send(bufferData);
        }
      });
    } catch (e) {
      // ignore parsing errors for raw buffers
    }
  }
});

wss.on('connection', (ws) => {
  // इथे दुरुस्ती केली आहे: .toString(36).substring(7)
  ws.id = Math.random().toString(36).substring(7);
  clients.set(ws, true);

  ws.on('message', (message) => {
    const payload = {
      senderId: ws.id,
      payload: Buffer.from(message).toString('base64')
    };

    redisPub.publish(CHANNEL, JSON.stringify(payload), (err) => {
      if (err) {
        console.error('Failed to publish message to Redis:', err);
      }
    });
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});