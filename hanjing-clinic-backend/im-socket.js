import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { run, get } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hanjing_clinic_secret_key_2026';

// Global map to store connected clients by patient_id
const activeClients = new Map();

export function initWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

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
          if (err || !decoded) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }

          // Verify patient exists
          get(`SELECT id, name FROM patients WHERE user_id = ? AND relation = 'self'`, [decoded.id])
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

          // Trigger simulated assistant auto-reply after 1.5 seconds to close loop
          setTimeout(async () => {
            try {
              let assistantReply = `您好！这里是鼾静健康诊所客服助手。我们已收到您的消息："${data.text}"。专业医生及健康顾问稍后会为您解答，请耐心等待。`;
              if (data.text.startsWith('[image]') || data.text.startsWith('/uploads/') || data.text.startsWith('http')) {
                assistantReply = `您好！这里是鼾静健康诊所客服助手。我们已收到您发送的图片附件。专业医生及健康顾问稍后会为您进行解答，请您耐心等待。`;
              }
              const autoMsgResult = await run(
                `INSERT INTO im_messages (patient_id, sender, sender_name, text, is_read) 
                 VALUES (?, 'doctor', '智能助理', ?, 0)`,
                [ws.patientId, assistantReply]
              );

              // Check if client is still connected, and send message
              if (activeClients.get(ws.patientId) === ws) {
                ws.send(JSON.stringify({
                  type: 'message',
                  id: autoMsgResult.id ? String(autoMsgResult.id) : String(Date.now() + 1),
                  from: 'assistant',
                  text: assistantReply,
                  time: new Date().toTimeString().slice(0, 5)
                }));
              }
            } catch (err) {
              console.error('WebSocket auto reply error:', err);
            }
          }, 1500);
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
}
