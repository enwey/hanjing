import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { run } from './db.js';
import { getPrimaryPatientForUser, JWT_SECRET } from './helpers.js';

// Global map to store connected clients by patient_id
const activeClients = new Map();

export function initWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/api/v1/im/ws') {
        const token = url.searchParams.get('token');
        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err || !decoded?.openid || !decoded.id || decoded.scope === 'asset') {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }

          // Verify patient exists
          getPrimaryPatientForUser(decoded.id)
            .then((patient) => {
              if (!patient) {
                socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
                socket.destroy();
                return;
              }

              wss.handleUpgrade(request, socket, head, (ws) => {
                ws.patientId = patient.id;
                ws.patientName = patient.name;
                wss.emit('connection', ws, request);
              });
            })
            .catch(() => {
              socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
              socket.destroy();
            });
        });
      } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    } catch (err) {
      console.error('Upgrade request parsing error:', err);
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log(`[WebSocket] Patient ${ws.patientName} (ID: ${ws.patientId}) connected.`);
    
    // Store connection
    activeClients.set(ws.patientId, ws);

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (data.text) {
          // Save client message to database
          const msgResult = await run(
            `INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) 
             VALUES (?, 'patient', ?, ?, 0)`,
            [ws.patientId, ws.patientName, data.text]
          );

          const timeStr = new Date().toTimeString().slice(0, 5);
          
          // Send ACK back to the client
          ws.send(JSON.stringify({
            type: 'ack',
            id: msgResult.id ? String(msgResult.id) : String(Date.now()),
            text: data.text,
            time: timeStr
          }));

        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Patient ${ws.patientName} disconnected.`);
      if (activeClients.get(ws.patientId) === ws) {
        activeClients.delete(ws.patientId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Connection error for ${ws.patientName}:`, err);
    });
  });
  return wss;
}
