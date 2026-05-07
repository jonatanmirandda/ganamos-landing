/* =========================================================
 * Persistencia JSON simple para chats y mensajes.
 * Sin dependencias nativas — funciona en cualquier sistema.
 * Para alto volumen, migrar a SQLite o Postgres.
 * =======================================================*/
const path = require('path');
const fs = require('fs');

const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'chats.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let state = { chats: {} };
if (fs.existsSync(DATA_FILE)) {
  try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { state = { chats: {} }; }
}

let writePending = false;
function persist() {
  if (writePending) return;
  writePending = true;
  setImmediate(() => {
    writePending = false;
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 0));
  });
}

function ensureChat(id) {
  if (!state.chats[id]) {
    const now = Date.now();
    state.chats[id] = {
      id, name: null, phone: null, status: 'open',
      operator_id: null, created_at: now, updated_at: now,
      messages: [],
    };
    persist();
  }
  return summarize(state.chats[id]);
}

function updateChatMeta(id, { name, phone }) {
  const c = state.chats[id]; if (!c) return null;
  if (name)  c.name  = name;
  if (phone) c.phone = phone;
  c.updated_at = Date.now();
  persist();
  return summarize(c);
}

function setChatStatus(id, status) {
  const c = state.chats[id]; if (!c) return null;
  c.status = status; c.updated_at = Date.now();
  persist();
  return summarize(c);
}

function getChat(id) {
  const c = state.chats[id];
  return c ? summarize(c) : null;
}

function listChats() {
  return Object.values(state.chats)
    .map(summarize)
    .sort((a, b) => (b.last_at || b.updated_at) - (a.last_at || a.updated_at))
    .slice(0, 200);
}

function addMessage(chatId, sender, { text = null, fileUrl = null, fileName = null } = {}) {
  ensureChat(chatId);
  const c = state.chats[chatId];
  const now = Date.now();
  const msg = {
    id: c.messages.length + 1,
    chat_id: chatId,
    sender,
    text,
    file_url: fileUrl,
    file_name: fileName,
    created_at: now,
  };
  c.messages.push(msg);
  c.updated_at = now;
  persist();
  return msg;
}

function listMessages(chatId) {
  const c = state.chats[chatId];
  return c ? c.messages.slice() : [];
}

function summarize(c) {
  const last = c.messages[c.messages.length - 1];
  return {
    id: c.id, name: c.name, phone: c.phone, status: c.status,
    operator_id: c.operator_id,
    created_at: c.created_at, updated_at: c.updated_at,
    last_text: last ? (last.text || (last.file_url ? '📎 archivo' : '')) : null,
    last_at:   last ? last.created_at : null,
  };
}

module.exports = {
  ensureChat, updateChatMeta, setChatStatus, getChat, listChats,
  addMessage, listMessages,
};
