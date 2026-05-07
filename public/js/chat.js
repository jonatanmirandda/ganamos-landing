/* =========================================================
 * Chat embebido — Ganamos.net
 * Los mensajes y datos vienen de /api/settings (configurables
 * desde el panel admin sin tocar código).
 * =======================================================*/
(() => {
  const launcher = document.getElementById('chat-launcher');
  const panel    = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const body     = document.getElementById('chat-body');
  const form     = document.getElementById('chat-form');
  const input    = document.getElementById('chat-text');
  const fileIn   = document.getElementById('chat-file');
  const quickBox = document.getElementById('chat-quick');
  const unread   = document.getElementById('chat-unread');
  const headAgent = document.getElementById('chat-agent');
  const headAvatar = document.querySelector('.chat-head-avatar');
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', openChat));

  const STORE_KEY = 'ganamos_chat_v1';
  const persisted = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  const state = {
    chatId: persisted.chatId || null,
    name:   persisted.name   || null,
    phone:  persisted.phone  || null,
    user:   persisted.user   || null,
    amount: persisted.amount || null,
    step:   persisted.step   || 'greet',
    handoff: persisted.handoff || false,
    whatsappNumber: '5491100000000',
    settings: null,
  };
  function persist() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // ---------- helpers ----------
  function tpl(str, vars) {
    return String(str || '').replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] != null ? vars[k] : (state.settings && state.settings[k] != null ? state.settings[k] : '')
    );
  }
  function msgText(key, vars = {}) {
    const m = state.settings && state.settings.messages ? state.settings.messages[key] : null;
    if (!m) return '';
    const merged = {
      agentName: state.settings.agentName || '',
      cbu: state.settings.cbu || '',
      alias: state.settings.alias || '',
      titular: state.settings.titular || '',
      minAmount: (state.settings.minAmount || 1000).toLocaleString('es-AR'),
      ...vars,
    };
    return tpl(m, merged);
  }
  function applyAgentBranding() {
    if (!state.settings) return;
    if (headAgent) headAgent.textContent = `${state.settings.agentName} · ${state.settings.agentTitle}`;
    if (headAvatar) headAvatar.textContent = state.settings.agentInitial || (state.settings.agentName||'A').charAt(0);
  }

  // ---------- socket ----------
  const socket = io();
  socket.on('connect', () => { socket.emit('user:join', { chatId: state.chatId }); });
  socket.on('user:joined', ({ chatId }) => { state.chatId = chatId; persist(); });
  socket.on('message', (msg) => {
    if (msg.sender === 'operator') {
      addMessage('operator', msg.text);
      bumpUnread();
    } else if (msg.sender === 'system' && msg.text) {
      addMessage('system', msg.text);
    }
  });
  socket.on('settings:updated', (s) => {
    state.settings = s;
    applyAgentBranding();
  });

  // ---------- carga inicial ----------
  Promise.all([
    fetch('/api/config').then(r => r.json()).catch(() => ({})),
    fetch('/api/settings').then(r => r.json()).catch(() => null),
  ]).then(([cfg, settings]) => {
    if (cfg && cfg.whatsappNumber) state.whatsappNumber = cfg.whatsappNumber;
    if (settings) {
      state.settings = settings;
      applyAgentBranding();
    }
  });

  // ---------- render helpers ----------
  function addMessage(sender, text, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = `msg msg-${sender}`;
    if (opts.html) wrap.innerHTML = text; else wrap.textContent = text;
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }
  function showTyping() {
    const t = document.createElement('div');
    t.className = 'msg msg-bot typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(t); body.scrollTop = body.scrollHeight;
    return t;
  }
  function botSay(text, delay = 700, html = false) {
    const typing = showTyping();
    return new Promise(resolve => setTimeout(() => {
      typing.remove();
      addMessage('bot', text, { html });
      try { socket.emit('user:bot', { text }); } catch {}
      resolve();
    }, delay));
  }
  function setQuickReplies(options = []) {
    quickBox.innerHTML = '';
    options.forEach(opt => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.addEventListener('click', () => {
        clearQuickReplies();
        handleUserInput(opt.value || opt.label);
      });
      quickBox.appendChild(b);
    });
  }
  function clearQuickReplies() { quickBox.innerHTML = ''; }
  function bumpUnread() { if (!panel.classList.contains('open')) unread.hidden = false; }

  function openChat() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    unread.hidden = true;
    input.focus();
    if (!state.greeted) startFlow();
  }
  function closeChat() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  launcher.addEventListener('click', () => panel.classList.contains('open') ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);

  // Esperar a que las settings hayan cargado antes de empezar el flujo
  async function ensureSettings() {
    let tries = 0;
    while (!state.settings && tries < 50) {
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
  }

  async function startFlow() {
    state.greeted = true; persist();
    await ensureSettings();
    await botSay(msgText('greeting1'), 400);
    await botSay(msgText('greeting2'), 900);
    state.step = state.name ? 'ask_user' : 'ask_name';
    persist();
    if (state.name) await botSay(msgText('afterName', { name: state.name }) + ' ' + msgText('askUser'));
  }

  async function handleUserInput(text) {
    text = (text || '').trim();
    if (!text) return;
    addMessage('user', text);
    socket.emit('user:message', { text });

    switch (state.step) {
      case 'ask_name': {
        state.name = text;
        socket.emit('user:meta', { name: state.name });
        persist();
        await botSay(msgText('afterName', { name: state.name }));
        await botSay(msgText('askUser'));
        state.step = 'ask_user'; persist();
        break;
      }
      case 'ask_user': {
        if (/^no tengo$/i.test(text)) {
          await botSay(msgText('noAccount'));
          state.step = 'collect_dni';
        } else {
          state.user = text;
          await botSay(msgText('askAmount'));
          state.step = 'ask_amount';
        }
        persist();
        break;
      }
      case 'collect_dni': {
        await botSay(msgText('noAccountAck'));
        state.step = 'open'; persist();
        break;
      }
      case 'ask_amount': {
        const num = Number(String(text).replace(/[^\d]/g, ''));
        const min = state.settings ? state.settings.minAmount : 1000;
        if (!num || num < min) {
          await botSay(msgText('amountTooLow'));
          break;
        }
        state.amount = num; persist();
        const formattedAmount = state.amount.toLocaleString('es-AR');
        await botSay(msgText('amountConfirm', { amount: formattedAmount }));
        await botSay(msgText('bankInfo'), 600, true);
        await new Promise(r => setTimeout(r, 200));
        addMessage('bot', msgText('askReceipt'), { html: true });
        try { socket.emit('user:bot', { text: msgText('askReceipt').replace(/<[^>]+>/g, '') }); } catch {}
        state.step = 'wait_receipt'; persist();
        setQuickReplies([
          { label: 'Adjuntar comprobante', value: '__attach__' },
          { label: 'No tengo cuenta bancaria' },
        ]);
        break;
      }
      case 'wait_receipt': {
        if (text === '__attach__') {
          fileIn.click();
        } else if (/no tengo/i.test(text)) {
          await botSay(msgText('noBank'));
        } else {
          await botSay(msgText('waitReceipt'));
        }
        break;
      }
      case 'after_receipt': {
        await botSay(msgText('fallback'));
        break;
      }
      default: {
        await botSay(msgText('fallback'));
      }
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    handleUserInput(t);
  });

  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    if (!file) return;
    if (!state.chatId) {
      await new Promise(r => {
        const i = setInterval(() => { if (state.chatId) { clearInterval(i); r(); } }, 100);
      });
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('chatId', state.chatId);

    const wrap = document.createElement('div');
    wrap.className = 'msg msg-user';
    wrap.innerHTML = `<div class="msg-file">📎 ${escapeHtml(file.name)}</div>`;
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      wrap.querySelector('.msg-file').appendChild(img);
    }
    body.appendChild(wrap); body.scrollTop = body.scrollHeight;

    try {
      const resp = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      await resp.json();
    } catch (err) {
      addMessage('system', 'No pudimos subir el archivo. Probá de nuevo.');
      console.error(err);
      return;
    }

    fileIn.value = '';
    await botSay(msgText('receiptReceived'), 700);
    await botSay(msgText('handoff'), 1200);
    addMessage('system', 'Derivando a WhatsApp...');

    state.handoff = true; state.step = 'after_receipt'; persist();
    socket.emit('user:handoff');

    const summary = [
      'Hola, soy ' + (state.name || 'cliente') + '.',
      state.user   ? 'Usuario Ganamos.net: ' + state.user : null,
      state.amount ? 'Monto cargado: $' + state.amount.toLocaleString('es-AR') : null,
      'Te envío comprobante por acá. (Chat ID: ' + state.chatId + ')',
    ].filter(Boolean).join('\n');
    const wa = `https://wa.me/${state.whatsappNumber}?text=${encodeURIComponent(summary)}`;

    const link = document.createElement('a');
    link.href = wa;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'btn btn-primary';
    link.style.cssText = 'margin: 8px auto; display: inline-flex; align-items:center; gap:8px;';
    link.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.881.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.881-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.982z"/></svg>
      Abrir WhatsApp
    `;
    const wrapBtn = document.createElement('div');
    wrapBtn.style.cssText = 'text-align:center; padding: 6px 0;';
    wrapBtn.appendChild(link);
    body.appendChild(wrapBtn);
    body.scrollTop = body.scrollHeight;

    setQuickReplies([{ label: 'Abrir WhatsApp', value: '__wa__' }]);
    quickBox.querySelector('button').addEventListener('click', () => window.open(wa, '_blank'));
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  if (state.name) state.greeted = true;
})();
