/* =========================================================
 * Panel admin · responde chats en vivo
 * =======================================================*/
(() => {
  const loginScreen = document.getElementById('login-screen');
  const appEl       = document.getElementById('app');
  const loginForm   = document.getElementById('login-form');
  const loginErr    = document.getElementById('login-err');
  const connStatus  = document.getElementById('conn-status');

  const chatListEl  = document.getElementById('chat-list');
  const threadEl    = document.getElementById('thread');
  const threadHead  = document.getElementById('thread-head');
  const composer    = document.getElementById('composer');
  const replyInput  = document.getElementById('reply');
  const sendBtn     = document.getElementById('send');
  const closeBtn    = document.getElementById('close-chat');
  const waBtn       = document.getElementById('open-wa');
  const metaContent = document.getElementById('meta-content');

  const STATE = {
    socket: null,
    auth:   null,                // { user, pass }
    chats:  new Map(),           // id -> chat row
    activeChatId: null,
    whatsappNumber: '5491100000000',
  };

  // ---------- entrada ----------
  // Mostrar login si no hay sesión guardada
  const saved = sessionStorage.getItem('admin_auth');
  if (saved) {
    STATE.auth = JSON.parse(saved);
    boot();
  } else {
    loginScreen.hidden = false;
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    STATE.auth = {
      user: document.getElementById('login-user').value.trim(),
      pass: document.getElementById('login-pass').value,
    };
    sessionStorage.setItem('admin_auth', JSON.stringify(STATE.auth));
    boot();
  });

  function boot() {
    // socket auth
    const socket = io();
    STATE.socket = socket;

    socket.on('connect', () => {
      socket.emit('admin:auth', STATE.auth);
    });

    socket.on('admin:authed', ({ ok }) => {
      if (!ok) {
        sessionStorage.removeItem('admin_auth');
        loginErr.textContent = 'Credenciales inválidas';
        loginScreen.hidden = false;
        appEl.hidden = true;
        return;
      }
      loginScreen.hidden = true;
      appEl.hidden = false;
      setConn(true);
      fetch('/api/admin/chats', { headers: authHeader() })
        .then(r => r.json())
        .then(({ chats }) => { chats.forEach(addOrUpdateChat); renderChatList(); });
      fetch('/api/config').then(r => r.json()).then(cfg => {
        if (cfg.whatsappNumber) STATE.whatsappNumber = cfg.whatsappNumber;
      });
    });

    socket.on('disconnect', () => setConn(false));
    socket.on('connect_error', () => setConn(false));

    socket.on('chat:updated', ({ chatId }) => {
      // refrescar metadata del chat
      fetch('/api/admin/chats', { headers: authHeader() })
        .then(r => r.json())
        .then(({ chats }) => {
          chats.forEach(addOrUpdateChat);
          renderChatList();
          if (chatId === STATE.activeChatId) renderMeta();
        });
    });

    socket.on('message', (msg) => {
      const id = msg.chatId || msg.chat_id;
      if (id === STATE.activeChatId) appendMessage(msg);
    });

    socket.on('admin:history', ({ chatId, messages }) => {
      if (chatId !== STATE.activeChatId) return;
      threadEl.innerHTML = '';
      messages.forEach(appendMessage);
      threadEl.scrollTop = threadEl.scrollHeight;
    });
  }

  function authHeader() {
    return { Authorization: 'Basic ' + btoa(`${STATE.auth.user}:${STATE.auth.pass}`) };
  }

  function setConn(live) {
    connStatus.classList.toggle('live', live);
    connStatus.querySelector('span:last-child').textContent = live ? 'en vivo' : 'desconectado';
  }

  // ---------- chats ----------
  function addOrUpdateChat(chat) { STATE.chats.set(chat.id, chat); }

  function renderChatList() {
    const items = [...STATE.chats.values()]
      .sort((a, b) => (b.last_at || b.updated_at) - (a.last_at || a.updated_at));
    chatListEl.innerHTML = '';
    if (!items.length) {
      chatListEl.innerHTML = '<div style="padding:16px;color:#8b94a3;font-style:italic;">Sin conversaciones todavía.</div>';
      return;
    }
    for (const c of items) {
      const el = document.createElement('div');
      el.className = 'chat-item' + (c.id === STATE.activeChatId ? ' active' : '');
      el.innerHTML = `
        <div class="row">
          <span class="name">${escapeHtml(c.name || 'Visitante')}</span>
          <span class="time">${formatTime(c.last_at || c.updated_at)}</span>
        </div>
        <div class="row">
          <span class="last">${escapeHtml(c.last_text || '...')}</span>
          <span class="pill ${c.status}">${c.status}</span>
        </div>
      `;
      el.addEventListener('click', () => openChat(c.id));
      chatListEl.appendChild(el);
    }
  }

  function openChat(id) {
    STATE.activeChatId = id;
    STATE.socket.emit('admin:open', { chatId: id });
    threadEl.innerHTML = '';
    replyInput.disabled = false;
    sendBtn.disabled = false;
    closeBtn.hidden = false;
    waBtn.hidden = false;
    renderHead();
    renderMeta();
    renderChatList();
  }

  function renderHead() {
    const c = STATE.chats.get(STATE.activeChatId);
    if (!c) return;
    threadHead.querySelector('.info .name').textContent = c.name || 'Visitante';
    threadHead.querySelector('.info .sub').textContent  = `ID: ${c.id} · Estado: ${c.status}`;
  }

  function renderMeta() {
    const c = STATE.chats.get(STATE.activeChatId);
    if (!c) { metaContent.innerHTML = '<p class="empty">Sin chat seleccionado.</p>'; return; }
    metaContent.innerHTML = `
      <dl>
        <dt>Nombre</dt><dd>${escapeHtml(c.name || '—')}</dd>
        <dt>Teléfono</dt><dd>${escapeHtml(c.phone || '—')}</dd>
        <dt>Estado</dt><dd>${escapeHtml(c.status)}</dd>
        <dt>Inicio</dt><dd>${new Date(c.created_at).toLocaleString('es-AR')}</dd>
        <dt>Última actividad</dt><dd>${new Date(c.last_at || c.updated_at).toLocaleString('es-AR')}</dd>
        <dt>Chat ID</dt><dd style="font-family:monospace;font-size:0.85rem;">${escapeHtml(c.id)}</dd>
      </dl>
    `;
  }

  function appendMessage(msg) {
    const el = document.createElement('div');
    el.className = 'm m-' + msg.sender;
    let html = '';
    if (msg.text) html += escapeHtml(msg.text).replace(/\n/g, '<br>');
    if (msg.file_url) {
      const isImg = /\.(png|jpe?g|webp|gif)$/i.test(msg.file_url);
      if (isImg) {
        html += `<a href="${msg.file_url}" target="_blank"><img src="${msg.file_url}" alt="${escapeHtml(msg.file_name||'comprobante')}"/></a>`;
      } else {
        html += `<br><a href="${msg.file_url}" target="_blank">📎 ${escapeHtml(msg.file_name||'archivo')}</a>`;
      }
    }
    el.innerHTML = html || '(vacío)';
    threadEl.appendChild(el);

    const meta = document.createElement('div');
    meta.className = 'm-meta';
    const senderLabel = ({ user: 'Cliente', operator: 'Vos', bot: 'Bot', system: 'Sistema' })[msg.sender] || msg.sender;
    meta.style.alignSelf = msg.sender === 'operator' ? 'flex-end' : 'flex-start';
    meta.textContent = `${senderLabel} · ${formatTime(msg.created_at)}`;
    threadEl.appendChild(meta);

    threadEl.scrollTop = threadEl.scrollHeight;
  }

  // ---------- enviar ----------
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = replyInput.value.trim();
    if (!text || !STATE.activeChatId) return;
    STATE.socket.emit('admin:message', { chatId: STATE.activeChatId, text });
    replyInput.value = '';
  });

  closeBtn.addEventListener('click', () => {
    if (!STATE.activeChatId) return;
    if (!confirm('¿Cerrar esta conversación?')) return;
    STATE.socket.emit('admin:close', { chatId: STATE.activeChatId });
  });

  waBtn.addEventListener('click', () => {
    const c = STATE.chats.get(STATE.activeChatId);
    if (!c) return;
    const summary = [
      'Hola ' + (c.name || '') + '!',
      'Te escribo desde el equipo de Ganamos.net por tu carga.',
      'Chat ID: ' + c.id,
    ].filter(Boolean).join('\n');
    const phone = (c.phone || STATE.whatsappNumber).replace(/[^\d]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(summary)}`, '_blank');
  });

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }
})();
