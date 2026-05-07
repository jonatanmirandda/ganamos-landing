# Ganamos.net · Landing + Chat + Admin en vivo

Landing minimalista con chat embebido que captura la primera carga de un cliente,
recibe el comprobante, lo persiste y deriva la conversación a WhatsApp.
Incluye panel admin en tiempo real (WebSockets) para responder o tomar el chat.

## Estructura

```
ganamos-landing/
├── server.js           ← Express + Socket.io
├── db.js               ← SQLite (better-sqlite3)
├── package.json
├── .env.example
├── public/
│   ├── index.html      ← Landing + chat widget
│   ├── admin.html      ← Panel admin
│   ├── img/logo.svg    ← Reemplazá con tu logo oficial
│   ├── css/styles.css
│   └── js/
│       ├── chat.js     ← Lógica del chat del cliente
│       └── admin.js    ← Lógica del panel admin
├── uploads/            ← Comprobantes (creado automáticamente)
└── data/chats.db       ← Base SQLite (creada automáticamente)
```

## Instalación

```bash
cd ganamos-landing
cp .env.example .env        # editá ADMIN_PASS y WHATSAPP_NUMBER
npm install
npm start
```

Abrir:

- **Landing**: http://localhost:3000/
- **Admin**:   http://localhost:3000/admin (usuario y pass del `.env`)

## Configuración (.env)

| Variable          | Descripción                                       |
|-------------------|---------------------------------------------------|
| `PORT`            | Puerto HTTP (default 3000)                        |
| `ADMIN_USER`      | Usuario del panel admin                           |
| `ADMIN_PASS`      | **Cambiala** antes de producción                  |
| `WHATSAPP_NUMBER` | Número con código país, sin `+` ni espacios       |
| `PUBLIC_URL`      | URL pública (solo para logs)                      |

## Flujo del chat (cliente)

1. Cliente abre el chat → bot saluda y pide nombre.
2. Pide usuario en Ganamos.net → ofrece alta si no tiene.
3. Pregunta monto a cargar (mín. $1.000).
4. Le pasa CBU/alias para transferir.
5. Cliente adjunta comprobante (imagen o PDF, máx 10 MB).
6. El comprobante se sube a `/uploads`, se persiste el chat y
   **el sistema deriva a WhatsApp** con un resumen pre-armado
   (nombre, usuario Ganamos, monto, ID del chat).
7. En paralelo, todos los mensajes llegan al panel admin.

## Panel admin

- `GET /admin` (auth básica). Lista todas las conversaciones, ordenadas por última actividad.
- Click en una conversación → ver historial y responder en tiempo real.
- Estados: **open** (en curso), **handoff** (derivada a WhatsApp), **closed**.
- "Abrir en WhatsApp" abre wa.me con el teléfono del cliente y un mensaje pre-cargado.
- Cerrar chat marca el estado como cerrado (no borra el historial).

## Deploy en producción (sugerencias)

- Hosting: Render, Fly.io, Railway, VPS con Node 20+.
- Poner detrás de Nginx con HTTPS (Let's Encrypt).
- Cambiar `ADMIN_USER` / `ADMIN_PASS` y considerar reemplazar Basic auth
  por un esquema de sesiones reales si vas a tener múltiples operadores.
- Backup periódico de `data/chats.db` y `uploads/`.
- Para escalar a más de un proceso, agregar Redis adapter a Socket.io.

## Reemplazar el logo

El archivo `public/img/logo.svg` es una recreación tipográfica del logotipo.
Si tenés el archivo oficial autorizado (PNG/SVG), reemplazalo manteniendo
el mismo nombre y ruta — la landing y el admin lo van a tomar automáticamente.

## Seguridad

- Las credenciales admin viajan en cabecera Basic Auth: usar siempre HTTPS.
- El upload acepta solo imágenes y PDF; el límite es 10 MB.
- El chat ID se guarda en `localStorage` del cliente para mantener continuidad.
- Validá comprobantes manualmente: el sistema no detecta fraudes automáticamente.

## Próximos pasos sugeridos

- Notificaciones push / sonido cuando llega un chat nuevo al admin.
- Webhook a WhatsApp Business API (oficial) en lugar de wa.me.
- Plantillas de respuestas rápidas para el operador.
- Métricas: tiempo medio de respuesta, conversiones.
