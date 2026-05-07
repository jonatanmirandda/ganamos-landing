# Deploy en Render.com (paso a paso)

Tiempo total: ~15 minutos. No necesitás tarjeta de crédito.

> ⚠️ **Limitaciones del plan Free de Render** que tenés que conocer ANTES:
> 1. **El servidor se duerme tras 15 minutos sin tráfico.** El primer request lo despierta y tarda ~30-60s en responder. Mientras dura ese arranque, los chats activos pueden cortarse.
> 2. **El disco es efímero.** Cada vez que Render redeploye o reinicie el servicio, se borran `uploads/` y `data/chats.json`. Sirve para probar; **para producción real necesitás un disco persistente (plan Starter, U$D 7/mes) o migrar a Railway/VPS**.
> 3. Solo tenés 750 horas/mes de CPU gratis (suficiente para un servicio).

---

## Parte 1 — Subir el proyecto a GitHub

Render se conecta a GitHub para hacer deploy automático cada vez que hacés `git push`.

```bash
# Desde la carpeta ganamos-landing/
cd ganamos-landing
git init
git add .
git commit -m "Primer commit: landing + chat + admin"
```

1. Andá a https://github.com/new
2. Nombre del repo: `ganamos-landing` (privado o público, no importa).
3. **No** marques "Add a README" — ya tenés uno.
4. Una vez creado, GitHub te muestra los comandos. Copiá los dos del bloque "...or push an existing repository":

```bash
git remote add origin https://github.com/TU-USUARIO/ganamos-landing.git
git branch -M main
git push -u origin main
```

---

## Parte 2 — Crear el servicio en Render

1. Andá a https://render.com y registrate (con tu cuenta de GitHub te ahorra pasos).
2. En el dashboard tocá **New +** → **Web Service**.
3. Tocá **Connect account** y autorizá Render a leer tu GitHub.
4. Buscá `ganamos-landing` en la lista y tocá **Connect**.
5. Render detecta el `render.yaml` y autocompleta casi todo. Configurá:
   - **Name**: `ganamos-landing` (será parte de la URL `ganamos-landing.onrender.com`).
   - **Region**: Oregon o Virginia (las más cercanas a Argentina con menor latencia).
   - **Branch**: `main`.
   - **Plan**: **Free**.
6. Bajá hasta **Environment Variables**. Render te va a pedir que completes los `sync: false`:
   - `ADMIN_PASS` → poné una contraseña fuerte (no compartas la del `.env` local).
   - `WHATSAPP_NUMBER` → tu número en formato `5491155551234` (sin `+` ni espacios).
7. Tocá **Create Web Service**. Render arranca el build (tarda 2-3 min la primera vez).

Cuando termine vas a ver: ✓ Your service is live at `https://ganamos-landing.onrender.com`.

Probá:
- `https://ganamos-landing.onrender.com/` → la landing.
- `https://ganamos-landing.onrender.com/admin` → te pide el `ADMIN_USER` (`admin`) y la contraseña que pusiste.

---

## Parte 3 — Conectar tu dominio propio

Asumimos que tu dominio es `tudominio.com` y querés que la landing viva en `ganamos.tudominio.com` (o `tudominio.com` directo).

### En Render

1. En tu servicio, andá a **Settings** → **Custom Domains**.
2. Tocá **Add Custom Domain**.
3. Ingresá tu dominio:
   - Para subdominio: `ganamos.tudominio.com`.
   - Para dominio raíz: `tudominio.com` (Render automáticamente también incluye `www`).
4. Render te muestra los registros DNS que tenés que agregar. Vas a ver algo como:

   **Para subdominio (`ganamos.tudominio.com`):**

   | Tipo | Nombre | Valor |
   |------|--------|-------|
   | CNAME | `ganamos` | `ganamos-landing.onrender.com` |

   **Para dominio raíz (`tudominio.com`):**

   | Tipo | Nombre | Valor |
   |------|--------|-------|
   | A | `@` | (IP que te da Render, ej: `216.24.57.1`) |
   | CNAME | `www` | `ganamos-landing.onrender.com` |

### En tu registrador de dominio

Entrá al panel de DNS de tu dominio (NIC.ar, GoDaddy, Namecheap, Cloudflare, etc.) y agregá esos registros tal cual.

> Si tu dominio es `.com.ar`/`.bet.ar`, andá a https://nic.ar → "Mis dominios" → tocá el dominio → "Editar zona DNS".
> Si usás Cloudflare como DNS, **desactivá el proxy (nube gris)** mientras Render emite el certificado SSL — después la podés volver a activar.

### Esperar verificación

Volvé a Render → **Custom Domains**. Cuando los DNS propaguen (entre 1 minuto y 24 horas, normalmente <30 min), Render automáticamente:
- Verifica el dominio.
- Emite un certificado SSL gratuito (Let's Encrypt).
- Activa HTTPS automático.

Vas a ver ✓ verde al lado de tu dominio. Listo, podés acceder por `https://ganamos.tudominio.com`.

---

## Parte 4 — Mantenimiento

### Updates de código

```bash
git add .
git commit -m "lo que cambiaste"
git push
```

Render redeploya automáticamente. Tarda 2-3 minutos.

### Ver logs

Dashboard → tu servicio → **Logs**. Vas a ver lo que printea `console.log` del server.

### Mantener el servicio despierto (truco)

Para evitar que el plan free duerma:
- Usá un servicio gratuito como https://uptimerobot.com que pingee tu URL cada 5 minutos.
- Configurá un monitor HTTPS hacia `https://ganamos.tudominio.com/api/config` cada 5 minutos.
- Así nunca pasan los 15 min sin tráfico y el server queda siempre activo.

> Aclaración: Render permite esto pero con plan free tenés un cap de 750 horas/mes. Si lo mantenés vivo 24/7 con uptime robot vas a consumir ~720 horas/mes — entra justo. Si tenés varios servicios free, te quedás sin cuota.

### Cuando estés listo para producción

Subí a un plan que tenga **disco persistente**:
- Render Starter (U$D 7/mes) + disco persistente (U$D 0.25/GB/mes).
- O migrá a Railway / VPS, donde el almacenamiento ya viene incluido y sin "dormir".

---

## Troubleshooting

**Build falla con "command not found":** verificá que `package.json` esté commiteado en GitHub.

**El chat no conecta (en producción aparece "desconectado"):** Render soporta WebSockets sin configuración especial; pero si usás Cloudflare en frente, asegurate de que esté en modo "Full" o "Full (strict)" y que WebSockets estén habilitados en Cloudflare → Network.

**Subo un comprobante y desaparece tras unas horas:** es la limitación de disco efímero del plan free. Es esperado. Migrá a plan pago o a un host con almacenamiento persistente.

**404 en `/admin`:** revisá que pusiste `ADMIN_USER` y `ADMIN_PASS` en las env vars de Render.

**SSL no se emite:** suele ser por DNS aún no propagado. Esperá 30 min más. Si tenés Cloudflare proxy activo, desactivalo temporalmente.
