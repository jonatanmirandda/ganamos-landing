# Ganamos.net · Landing + Chat + Admin en vivo

Landing minimalista con chat embebido que captura la primera carga de un cliente,
recibe el comprobante, lo persiste y deriva la conversación a WhatsApp.
Incluye panel admin en tiempo real (WebSockets) para responder o tomar el chat.

## Estructura

```
ganamos-landing/
├── server.js           ← Express + Socket.io
├── db.js               ← Persistencia JSON
├── package.json
├── render.yaml         ← Config para deploy en Render
├── DEPLOY.md           ← Guía de deploy paso a paso
├── .env.example
├── public/
│   ├── index.html      ← Landing + chat widget
│   ├── admin.html      ← Panel admin
│   ├── img/logo.svg    ← Logo (reemplazá con archivo oficial si tenés)
│   ├── css/styles.css
│   └── js/
│       ├── chat.js     ← Lógica del chat del cliente
│       └── admin.js    ← Lógica del panel admin
├── uploads/            ← Comprobantes (creado automáticamente)
└── data/chats.json     ← Base de datos (creada automáticamente)
```

## Probar localmente

```bash
cd ganamos-landing
cp .env.example .env        # editá ADMIN_PASS y WHATSAPP_NUMBER
npm install
npm start
```

- Landing: http://localhost:3000/
- Admin:   http://localhost:3000/admin

## Deploy a producción

Ver `DEPLOY.md` para guía paso a paso de deploy en Render.com con dominio propio.

## Configuración (.env)

| Variable          | Descripción                                       |
|-------------------|---------------------------------------------------|
| `PORT`            | Puerto HTTP (default 3000)                        |
| `ADMIN_USER`      | Usuario del panel admin                           |
| `ADMIN_PASS`      | **Cambiala** antes de producción                  |
| `WHATSAPP_NUMBER` | Número con código país, sin `+` ni espacios       |

## Flujo del chat

1. Cliente abre el chat → bot pide nombre.
2. Pide usuario en Ganamos.net.
3. Pregunta monto a cargar.
4. Le pasa CBU/alias para transferir.
5. Cliente adjunta comprobante (imagen o PDF).
6. Sistema deriva a WhatsApp con resumen pre-armado.
7. Todos los mensajes llegan al panel admin en vivo.

## Reemplazar el logo

`public/img/logo.svg` es una recreación tipográfica.
Reemplazalo con tu archivo oficial manteniendo el mismo nombre.
