/* =========================================================
 * Chat embebido — Ganamos.net (proveedor oficial)
 * Flujo conversacional con captura de datos, recepción
 * de comprobante y handoff a WhatsApp + admin en vivo.
 * =======================================================*/
(() => {
  // ----- DOM -----
  const launcher = document.getElementById('chat-launcher');
  const panel    = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const body     = document.getElementById('chat-body');
  const form     = document.getElementById('chat-form');
  const input    = document.getElementById('chat-text');
  const fileIn   = document.getElementById('chat-file');
  const quickBox = document.getElementById('chat-quick');
  const unread   = document.getElementById('chat-unread');
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', openChat));

  // ----- Estado -----
  const STORE_KEY = 'ganamos_chat_v1';
  const persisted = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  const state = {
    chatId: persisted.chatId || null,
    name:   persisted.name   || null,
    phone:  persisted.phone  || null,
    user:   persisted.user   || null,    // usuario en Ganamos.net
    amount: persisted.amount || null,
    step:   persisted.step   || 'greet',
    handoff: persisted.handoff || false,
    whatsappNumber: '5491100000000',
  };
  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  // ----- Socket -----
  const socket = io();
  socket.on('connect', () => {
    socket.emit('user:join', { chatId: state.chatId });
  });
  socket.on('user:joined', ({ chatId }) => {
    state.chatId = chatId; persist();
  });
  socket.on('message', (msg) => {
    // Solo pintar mensajes del operador o del sistema; los del bot ya los pintamos localmente.
    if (msg.sender === 'operator') {
      addMessage('operator', msg.text);
      bumpUnread();
    } else if (msg.sender === 'system' && msg.text) {
      addMessage('system', msg.text);
    }
  });

  // ----- Config pública (whatsapp number) -----
  fetch('/api/config').then(r => r.json()).then(cfg => {
    if (cfg.whatsappNumber) state.whatsappNumber = cfg.whatsappNumber;
  }).catch(() => {});

  // ----- Render helpers -----
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
  function botSay(text, delay = 700) {
    const typing = showTyping();
    return new Promise(resolve => setTimeout(() => {
      typing.remove();
      addMessage('bot', text);
      // Reportar al admin lo que dijo el bot (trazabilidad)
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
  function bumpUnread() {
    if (!panel.classList.contains('open')) {
      unread.hidden = false;
    }
  }

  // ----- Open / Close -----
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

  // ----- Flujo conversacional -----
  async function startFlow() {
    state.greeted = true; persist();
    await botSay('¡Hola! 👋 Soy Lucía, del equipo de proveedor oficial Ganamos.net.', 400);
    await botSay('Te ayudo a hacer tu primera carga en menos de 2 minutos. ¿Cómo te llamás?', 900);
    state.step = state.name ? 'ask_user' : 'ask_name';
    persist();
    if (state.name) {
      await botSay(`¡Buenísimo, ${state.name}! ¿Tu usuario en Ganamos.net?`);
    }
  }

  async function handleUserInput(text) {
    text = (text || '').trim();
    if (!text) return;

    // pintar mensaje del usuario
    addMessage('user', text);
    socket.emit('user:message', { text });

    switch (state.step) {
      case 'ask_name': {
        state.name = text;
        socket.emit('user:meta', { name: state.name });
        persist();
        await botSay(`¡Buenísimo, ${state.name}! 😊`);
        await botSay('¿Cuál es tu usuario en Ganamos.net? (si no tenés, escribí *no tengo*)');
        state.step = 'ask_user';
        persist();
        break;
      }
      case 'ask_user': {
        if (/^no tengo$/i.test(text)) {
          await botSay('No hay drama, te ayudamos a abrir la cuenta. ¿Me pasás tu DNI y un teléfono de contacto?');
          state.step = 'collect_dni';
        } else {
          state.user = text;
          await botSay('Perfecto. ¿Qué monto querés cargar? (mínimo $1.000)');
          state.step = 'ask_amount';
        }
        persist();
        break;
      }
      case 'collect_dni': {
        await botSay('¡Genial! Ya le paso los datos a un agente y te contactamos en minutos.');
        state.step = 'open';
        persist();
        break;
      }
      case 'ask_amount': {
        const num = Number(String(text).replace(/[^\d]/g, ''));
        if (!num || num < 1000) {
          await botSay('El mínimo es $1.000. ¿Me decís el monto?');
          break;
        }
        state.amount = num; persist();
        await botSay(`Listo, ${state.amount.toLocaleString('es-AR')} pesos. Te paso los datos para transferir 👇`);
        await botSay(`<strong>CBU:</strong> 0000003100099876543210<br><strong>Alias:</strong> GANAMOS.OFICIAL.MP<br><strong>Titular:</strong> Operador Oficial S.A.`, 600);
        await new Promise(r => setTimeout(r, 200));
        addMessage('bot', 'Cuando termines la transferencia, <strong>adjuntá el comprobante</strong> tocando el clip 📎', { html: true });
        try { socket.emit('user:bot', { text: 'Te paso CBU y alias. Adjuntá el comprobante cuando termines.' }); } catch {}
        state.step = 'wait_receipt';
        persist();
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
          await botSay('Ok, también aceptamos efectivo en puntos de pago. ¿Querés que te pase la lista?');
        } else {
          await botSay('Cuando tengas el comprobante, tocá el clip 📎 para adjuntarlo. ¡Te espero!');
        }
        break;
      }
      case 'after_receipt': {
        await botSay('¿Querés algo más mientras tanto?');
        break;
      }
      default: {
        // chat libre — responder por defecto y dejar que el operador tome
        await botSay('Te leo, ya hay un agente humano disponible para seguir la conversación 💬');
      }
    }
  }

  // ----- Input -----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    handleUserInput(t);
  });

  // ----- Adjuntar comprobante -----
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    if (!file) return;
    if (!state.chatId) {
      // Esperar a que el socket asigne chatId
      await new Promise(r => {
        const i = setInterval(() => { if (state.chatId) { clearInterval(i); r(); } }, 100);
      });
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('chatId', state.chatId);

    // Vista previa local
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
    await botSay('¡Recibido! 🎉 Ya estoy validando el comprobante con un operador.', 700);
    await botSay('Para acreditar más rápido, te paso a WhatsApp con el agente humano que te va a confirmar la carga ✅', 1200);

    // Mensaje system para historial
    addMessage('system', 'Derivando a WhatsApp...');

    state.handoff = true; state.step = 'after_receipt'; persist();
    socket.emit('user:handoff');

    // Construir link a WhatsApp con resumen
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

  // Si ya había nombre/usuario guardados, restaurar al abrir
  if (state.name) state.greeted = true;
})();
