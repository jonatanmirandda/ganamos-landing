/* =========================================================
 * Panel admin · responde chats en vivo + edita configuración
 * =======================================================*/
(() => {
  const loginScreen = document.getElementById('login-screen');
  const appEl       = document.getElementById('app');
  const loginForm   = document.getElementById('login-form');
  const loginErr    = document.getElementById('login-err');
  const loginSubmit = loginForm.querySelector('button[type="submit"]');
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

  // Modal
  const settingsBtn   = document.getElementById('open-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-close');
  const settingsSave  = document.getElementById('settings-save');
  const settingsReset = document.getElementById('settings-reset');
  const settingsInfo  = document.getElementById('settings-info');
  const tabButtons    = document.querySelectorAll('.modal-tabs button');
  const tabPanes      = document.querySelectorAll('.tab-content');

  const STATE = {
    socket: null,
    auth:   null,
    chats:  new Map(),
    activeChatId: null,
    whatsappNumber: '5491100000000',
    authed: false,
    settings: null,
    defaults: null,
  };

  loginScreen.hidden = false;
  appEl.hidden = true;

  try {
    const saved = JSON.parse(sessionStorage.getItem('admin_auth') || 'null');
    if (saved && saved.user) document.getElementById('login-user').value = saved.user;
  } catch {}

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (!user || !pass) { loginErr.textContent = 'Completá usuario y contraseña'; return; }
    STATE.auth = { user, pass };
    loginErr.textContent = '';
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Conectando...';
    boot();
  });

  function showLoginError(msg) {
    loginErr.textContent = msg;
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Ingresar';
  }

  function boot() {
    if (STATE.socket) { try { STATE.socket.disconnect(); } catch {} }
    const socket = io({ reconnection: true });
    STATE.socket = socket;

    let authTimeout = setTimeout(() => {
      if (!STATE.authed) {
        showLoginError('No hubo respuesta del servidor. Probá de nuevo.');
        try { socket.disconnect(); } catch {}
      }
    }, 8000);

    socket.on('connect', () => { socket.emit('admin:auth', STATE.auth); });

    socket.on('connect_error', (err) => {
      clearTimeout(authTimeout);
      showLoginError('No se pudo conectar al servidor: ' + (err && err.message ? err.message : 'error'));
    });

    socket.on('admin:authed', ({ ok, reason }) => {
      clearTimeout(authTimeout);
      if (!ok) {
        sessionStorage.removeItem('admin_auth');
        showLoginError(reason || 'Usuario o contraseña incorrectos');
        return;
      }
      STATE.authed = true;
      sessionStorage.setItem('admin_auth', JSON.stringify(STATE.auth));
      loginScreen.hidden = true;
      appEl.hidden = false;
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Ingresar';
      setConn(true);

      fetch('/api/admin/chats', { headers: authHeader() })
        .then(r => r.json())
        .then(({ chats }) => { (chats || []).forEach(addOrUpdateChat); renderChatList(); })
        .catch(() => {});
      fetch('/api/config').then(r => r.json()).then(cfg => {
        if (cfg.whatsappNumber) STATE.whatsappNumber = cfg.whatsappNumber;
      }).catch(() => {});
      // pre-cargar settings
      loadSettings();
    });

    socket.on('disconnect', () => setConn(false));

    socket.on('chat:updated', () => {
      fetch('/api/admin/chats', { headers: authHeader() })
        .then(r => r.json())
        .then(({ chats }) => {
          (chats || []).forEach(addOrUpdateChat);
          renderChatList();
          if (STATE.activeChatId) renderMeta();
        }).catch(() => {});
    });

    socket.on('message', (msg) => {
      const id = msg.chatId || msg.chat_id;
      if (id === STATE.activeChatId) appendMessage(msg);
    });

    socket.on('admin:history', ({ chatId, messages }) => {
      if (chatId !== STATE.activeChatId) return;
      threadEl.innerHTML = '';
      (messages || []).forEach(appendMessage);
      threadEl.scrollTop = threadEl.scrollHeight;
    });
  }

  function authHeader() {
    if (!STATE.auth) return {};
    return { Authorization: 'Basic ' + btoa(`${STATE.auth.user}:${STATE.auth.pass}`) };
  }

  function setConn(live) {
    connStatus.classList.toggle('live', live);
    connStatus.querySelector('span:last-child').textContent = live ? 'en vivo' : 'desconectado';
  }

  // ============== CHATS ==============
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
        </div>`;
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
    renderHead(); renderMeta(); renderChatList();
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
      </dl>`;
  }

  function appendMessage(msg) {
    const el = document.createElement('div');
    el.className = 'm m-' + msg.sender;
    let html = '';
    if (msg.text) html += escapeHtml(msg.text).replace(/\n/g, '<br>');
    if (msg.file_url) {
      const isImg = /\.(png|jpe?g|webp|gif)$/i.test(msg.file_url);
      if (isImg) html += `<a href="${msg.file_url}" target="_blank"><img src="${msg.file_url}" alt="${escapeHtml(msg.file_name||'comprobante')}"/></a>`;
      else       html += `<br><a href="${msg.file_url}" target="_blank">📎 ${escapeHtml(msg.file_name||'archivo')}</a>`;
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

  // ============== SETTINGS / CONFIGURACIÓN ==============
  const MSG_KEYS = [
    'greeting1','greeting2','afterName','askUser','noAccount','noAccountAck',
    'askAmount','amountTooLow','amountConfirm','bankInfo','askReceipt',
    'receiptReceived','handoff','noBank','waitReceipt','fallback',
  ];
  const FIELD_KEYS = ['agentName','agentTitle','agentInitial','cbu','alias','titular','minAmount'];

  function loadSettings() {
    fetch('/api/admin/settings', { headers: authHeader() })
      .then(r => r.json())
      .then(({ settings, defaults }) => {
        STATE.settings = settings;
        STATE.defaults = defaults;
        populateForm(settings);
      })
      .catch(() => {});
  }

  function populateForm(s) {
    FIELD_KEYS.forEach(k => {
      const el = document.getElementById('cfg-' + k);
      if (el) el.value = s[k] != null ? s[k] : '';
    });
    MSG_KEYS.forEach(k => {
      const el = document.getElementById('cfg-msg-' + k);
      if (el) el.value = (s.messages && s.messages[k]) || '';
    });
  }

  function readForm() {
    const out = { messages: {} };
    FIELD_KEYS.forEach(k => {
      const el = document.getElementById('cfg-' + k);
      if (el) out[k] = el.value.trim();
    });
    MSG_KEYS.forEach(k => {
      const el = document.getElementById('cfg-msg-' + k);
      if (el) out.messages[k] = el.value;
    });
    if (out.minAmount !== undefined) out.minAmount = Number(out.minAmount) || 0;
    return out;
  }

  // tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.querySelector(`.tab-content[data-pane="${btn.dataset.tab}"]`);
      if (pane) pane.classList.add('active');
    });
  });

  function openSettings() {
    settingsInfo.textContent = '';
    settingsInfo.classList.remove('err');
    if (!STATE.settings) loadSettings();
    else populateForm(STATE.settings);
    settingsModal.hidden = false;
  }
  function closeSettings() { settingsModal.hidden = true; }

  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  settingsSave.addEventListener('click', () => {
    const body = readForm();
    settingsSave.disabled = true;
    settingsInfo.textContent = 'Guardando...';
    settingsInfo.classList.remove('err');
    fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(({ ok, settings: next, error }) => {
        settingsSave.disabled = false;
        if (!ok) {
          settingsInfo.textContent = 'Error: ' + (error || 'no se pudo guardar');
          settingsInfo.classList.add('err');
          return;
        }
        STATE.settings = next;
        settingsInfo.textContent = '✓ Guardado. Los cambios ya están aplicados en el chat.';
      })
      .catch(err => {
        settingsSave.disabled = false;
        settingsInfo.textContent = 'Error: ' + err.message;
        settingsInfo.classList.add('err');
      });
  });

  settingsReset.addEventListener('click', () => {
    if (!STATE.defaults) return;
    if (!confirm('¿Restablecer todos los valores a los predeterminados? Se va a perder lo que tengas configurado.')) return;
    populateForm(STATE.defaults);
    settingsInfo.textContent = 'Valores restablecidos en el formulario. Tocá "Guardar cambios" para aplicarlos.';
    settingsInfo.classList.remove('err');
  });

  // ============== UTILS ==============
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
