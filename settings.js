/* =========================================================
 * Configuración del chat — mensajes, datos bancarios, etc.
 * Se guarda en data/settings.json y se puede editar desde el admin.
 * Variables disponibles en mensajes: {agentName} {name} {user}
 *   {amount} {minAmount} {cbu} {alias} {titular}
 * =======================================================*/
const path = require('path');
const fs = require('fs');

const DATA_DIR  = path.join(__dirname, 'data');
const FILE_PATH = path.join(DATA_DIR, 'settings.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  agentName: 'Lucía',
  agentTitle: 'Atención al cliente',
  agentInitial: 'L',
  cbu: '0000003100099876543210',
  alias: 'GANAMOS.OFICIAL.MP',
  titular: 'Operador Oficial S.A.',
  minAmount: 1000,
  messages: {
    greeting1:        '¡Hola! 👋 Soy {agentName}, del equipo de proveedor oficial Ganamos.net.',
    greeting2:        'Te ayudo a hacer tu primera carga en menos de 2 minutos. ¿Cómo te llamás?',
    afterName:        '¡Buenísimo, {name}! 😊',
    askUser:          '¿Cuál es tu usuario en Ganamos.net? (si no tenés, escribí *no tengo*)',
    noAccount:        'No hay drama, te ayudamos a abrir la cuenta. ¿Me pasás tu DNI y un teléfono de contacto?',
    noAccountAck:     '¡Genial! Ya le paso los datos a un agente y te contactamos en minutos.',
    askAmount:        'Perfecto. ¿Qué monto querés cargar? (mínimo ${minAmount})',
    amountTooLow:     'El mínimo es ${minAmount}. ¿Me decís el monto?',
    amountConfirm:    'Listo, {amount} pesos. Te paso los datos para transferir 👇',
    bankInfo:         '<strong>CBU:</strong> {cbu}<br><strong>Alias:</strong> {alias}<br><strong>Titular:</strong> {titular}',
    askReceipt:       'Cuando termines la transferencia, <strong>adjuntá el comprobante</strong> tocando el clip 📎',
    receiptReceived:  '¡Recibido! 🎉 Ya estoy validando el comprobante con un operador.',
    handoff:          'Para acreditar más rápido, te paso a WhatsApp con el agente humano que te va a confirmar la carga ✅',
    noBank:           'Ok, también aceptamos efectivo en puntos de pago. ¿Querés que te pase la lista?',
    waitReceipt:      'Cuando tengas el comprobante, tocá el clip 📎 para adjuntarlo. ¡Te espero!',
    fallback:         'Te leo, ya hay un agente humano disponible para seguir la conversación 💬',
  },
};

let cache = null;

function load() {
  if (cache) return cache;
  if (fs.existsSync(FILE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      // merge con defaults para que nuevos campos no rompan
      cache = {
        ...DEFAULTS,
        ...data,
        messages: { ...DEFAULTS.messages, ...(data.messages || {}) },
      };
    } catch {
      cache = JSON.parse(JSON.stringify(DEFAULTS));
    }
  } else {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
    save(cache);
  }
  return cache;
}

function save(next) {
  cache = next;
  fs.writeFileSync(FILE_PATH, JSON.stringify(next, null, 2));
}

function update(patch) {
  const current = load();
  const merged = {
    ...current,
    ...patch,
    messages: { ...current.messages, ...(patch.messages || {}) },
  };
  // sanitize tipos
  if (merged.minAmount) merged.minAmount = Number(merged.minAmount) || DEFAULTS.minAmount;
  save(merged);
  return merged;
}

module.exports = { load, save, update, DEFAULTS };
