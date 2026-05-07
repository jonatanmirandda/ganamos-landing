require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const store = require('./db');
const settings = require('./settings');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5491100000000';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

app.get('/', (_req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(500).type('text/html').send(
    `<h1>Falta public/index.html</h1>`
  );
});

app.get('/api/config', (_req, res) => {
  res.json({ whatsappNumber: WHATSAPP_NUMBER });
});

app.get('/api/settings', (_req, res) => {
  const s = settings.load();
  res.json({
    agentName: s.agentName, agentTitle: s.agentTitle, agentInitial: s.agentInitial,
    cbu: s.cbu, alias: s.alias, titular: s.titular,
    minAmount: s.minAmount, messages: s.messages,
  });
});

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
  limits: { fileSize: 10 * 1024 * 1024 },
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
    text: 'Adjuntó comprobante', fileUrl, fileName: req.file.originalname,
  });
  io.to(`chat:${chatId}`).emit('message', msg);
  io.to('admins').emit('message', { ...msg, chatId });
  io.to('admins').emit('chat:updated', { chatId });
  res.json({ ok: true, message: msg });
});

// ============== ADMIN ==============
function checkCreds(user, pass) {
  return user === ADMIN_USER && pass === ADMIN_PASS;
}
function basicAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, b64] = header.split(' ');
  if (scheme !== 'Basic' || !b64) return reject();
  const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
  if (!checkCreds(u, p)) return reject();
  next();
  function reject() {
    res.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).json({ ok: false, error: 'Credenciales inválidas' });
  }
}

// Login HTTP (no usa WebSockets, siempre funciona)
app.post('/api/admin/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (checkCreds(user, pass)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
  }
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
app.get('/api/admin/chats', basicAuth, (_req, res) => {
  res.json({ chats: store.listChats() });
});
app.get('/api/admin/chats/:id/messages', basicAuth, (req, res) => {
  res.json({ messages: store.listMessages(req.params.id) });
});
app.post('/api/admin/chats/:id/message', basicAuth, (req, res) => {
  const id = req.params.id;
  const text = (req.body && req.body.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Sin texto' });
  const msg = store.addMessage(id, 'operator', { text });
  io.to(`chat:${id}`).emit('message', msg);
  io.to('admins').emit('message', { ...msg, chatId: id });
  io.to('admins').emit('chat:updated', { chatId: id });
  res.json({ ok: true, message: msg });
});
app.post('/api/admin/chats/:id/close', basicAuth, (req, res) => {
  const id = req.params.id;
  const c = store.setChatStatus(id, 'closed');
  io.to('admins').emit('chat:updated', { chatId: id });
  res.json({ ok: true, chat: c });
});

app.get('/api/admin/settings', basicAuth, (_req, res) => {
  res.json({ settings: settings.load(), defaults: settings.DEFAULTS });
});
app.put('/api/admin/settings', basicAuth, (req, res) => {
  try {
    const next = settings.update(req.body || {});
    io.emit('settings:updated', {
      agentName: next.agentName, agentTitle: next.agentTitle, agentInitial: next.agentInitial,
      cbu: next.cbu, alias: next.alias, titular: next.titular,
      minAmount: next.minAmount, messages: next.messages,
    });
    res.json({ ok: true, settings: next });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ============== SOCKET.IO (solo para tiempo real, no obligatorio) ==============
io.on('connection', (socket) => {
  let role = null;
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

  socket.on('admin:auth', ({ user, pass }) => {
    if (checkCreds(user, pass)) {
      role = 'admin';
      socket.join('admins');
      socket.emit('admin:authed', { ok: true });
    } else {
      socket.emit('admin:authed', { ok: false, reason: 'Usuario o contraseña incorrectos' });
    }
  });

  socket.on('admin:open', ({ chatId: id }) => {
    if (role !== 'admin' || !id) return;
    socket.join(`chat:${id}`);
    socket.emit('admin:history', { chatId: id, messages: store.listMessages(id) });
  });
});

server.listen(PORT, () => {
  console.log(`▶ Servidor en ${PUBLIC_URL}`);
  console.log(`  Landing: ${PUBLIC_URL}/`);
  console.log(`  Admin  : ${PUBLIC_URL}/admin   (user: ${ADMIN_USER})`);
});
