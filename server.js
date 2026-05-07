require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const store = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5491100000000';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- public config ----------
app.get('/api/config', (_req, res) => {
  res.json({ whatsappNumber: WHATSAPP_NUMBER });
});

// ---------- file upload ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Tipo de archivo no permitido'), ok);
  },
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  const { chatId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Sin archivo' });
  if (!chatId)   return res.status(400).json({ error: 'chatId requerido' });
  store.ensureChat(chatId);
  const fileUrl = `/uploads/${req.file.filename}`;
  const msg = store.addMessage(chatId, 'user', {
    text: 'Adjuntó comprobante',
    fileUrl,
    fileName: req.file.originalname,
  });
  io.to(`chat:${chatId}`).emit('message', msg);
  io.to('admins').emit('message', { ...msg, chatId });
  io.to('admins').emit('chat:updated', { chatId });
  res.json({ ok: true, message: msg });
});

// ---------- auth básico para admin ----------
function basicAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, b64] = header.split(' ');
  if (scheme !== 'Basic' || !b64) return reject();
  const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
  if (u !== ADMIN_USER || p !== ADMIN_PASS) return reject();
  next();
  function reject() {
    res.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).send('Auth required');
  }
}
app.get('/admin', basicAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/api/admin/chats', basicAuth, (_req, res) => {
  res.json({ chats: store.listChats() });
});
app.get('/api/admin/chats/:id/messages', basicAuth, (req, res) => {
  res.json({ messages: store.listMessages(req.params.id) });
});

// ---------- socket.io ----------
io.on('connection', (socket) => {
  let role = null;     // 'user' | 'admin'
  let chatId = null;

  socket.on('user:join', ({ chatId: id }) => {
    role = 'user';
    chatId = id || crypto.randomBytes(6).toString('hex');
    store.ensureChat(chatId);
    socket.join(`chat:${chatId}`);
    socket.emit('user:joined', { chatId });
    io.to('admins').emit('chat:updated', { chatId });
  });

  socket.on('user:meta', ({ name, phone }) => {
    if (role !== 'user' || !chatId) return;
    store.updateChatMeta(chatId, { name, phone });
    io.to('admins').emit('chat:updated', { chatId });
  });

  socket.on('user:message', ({ text }) => {
    if (role !== 'user' || !chatId) return;
    const msg = store.addMessage(chatId, 'user', { text });
    io.to(`chat:${chatId}`).emit('message', msg);
    io.to('admins').emit('message', { ...msg, chatId });
    io.to('admins').emit('chat:updated', { chatId });
  });

  socket.on('user:bot', ({ text }) => {
    // El bot del cliente reporta lo que dijo, lo persistimos para que el admin lo vea
    if (role !== 'user' || !chatId) return;
    const msg = store.addMessage(chatId, 'bot', { text });
    io.to('admins').emit('message', { ...msg, chatId });
    io.to('admins').emit('chat:updated', { chatId });
  });

  socket.on('user:handoff', () => {
    if (role !== 'user' || !chatId) return;
    store.setChatStatus(chatId, 'handoff');
    const msg = store.addMessage(chatId, 'system', {
      text: 'Cliente derivado a WhatsApp con comprobante adjunto.',
    });
    io.to('admins').emit('message', { ...msg, chatId });
    io.to('admins').emit('chat:updated', { chatId });
  });

  // ----- admin -----
  socket.on('admin:auth', ({ user, pass }) => {
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      role = 'admin';
      socket.join('admins');
      socket.emit('admin:authed', { ok: true });
    } else {
      socket.emit('admin:authed', { ok: false });
    }
  });

  socket.on('admin:open', ({ chatId: id }) => {
    if (role !== 'admin' || !id) return;
    socket.join(`chat:${id}`);
    socket.emit('admin:history', { chatId: id, messages: store.listMessages(id) });
  });

  socket.on('admin:message', ({ chatId: id, text }) => {
    if (role !== 'admin' || !id || !text) return;
    const msg = store.addMessage(id, 'operator', { text });
    io.to(`chat:${id}`).emit('message', msg);
    io.to('admins').emit('message', { ...msg, chatId: id });
    io.to('admins').emit('chat:updated', { chatId: id });
  });

  socket.on('admin:close', ({ chatId: id }) => {
    if (role !== 'admin' || !id) return;
    store.setChatStatus(id, 'closed');
    io.to('admins').emit('chat:updated', { chatId: id });
  });
});

server.listen(PORT, () => {
  console.log(`▶ Servidor escuchando en ${PUBLIC_URL}`);
  console.log(`  Landing : ${PUBLIC_URL}/`);
  console.log(`  Admin   : ${PUBLIC_URL}/admin   (user: ${ADMIN_USER})`);
  console.log(`  WhatsApp: +${WHATSAPP_NUMBER}`);
});
