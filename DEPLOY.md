# Deploy en Render.com — paso a paso

## 1. Subir a GitHub

Opción A — con git (recomendado, no se pierde nada):

```bash
cd ganamos-landing
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/ganamos-landing.git
git push -u origin main
```

Opción B — drag and drop (si no usás git):
1. Creá un repo nuevo en https://github.com/new (nombre: `ganamos-landing`).
2. En el repo vacío tocá **uploading an existing file**.
3. Arrastrá **el contenido** de la carpeta (los archivos y subcarpetas, no la carpeta misma).
4. **IMPORTANTE**: si no aparece la carpeta `public/` después de subir, hacé otro upload arrastrando solo `public/` aparte.

Verificá que en la raíz del repo veas: `server.js`, `db.js`, `package.json`, `render.yaml`, y la carpeta `public/`. Sin esos archivos, el deploy falla.

## 2. Crear el servicio en Render

1. https://render.com → registrate con GitHub.
2. **+ New** → **Web Service** → seleccioná `ganamos-landing` → **Connect**.
3. Render lee `render.yaml` y autocompleta. Solo te pide:
   - `ADMIN_PASS` → contraseña del panel admin.
   - `WHATSAPP_NUMBER` → tu número, formato `5491155551234`.
4. **Create Web Service**. Esperá 2-3 minutos.

URL: `https://ganamos-landing.onrender.com`

## 3. Conectar dominio propio

En Render → **Settings** → **Custom Domains** → **Add**:
- Subdominio: `ganamos.tudominio.com`.

Render te muestra un valor tipo `ganamos-landing.onrender.com`. Copialo.

En el panel DNS de tu dominio agregá:
| Tipo  | Nombre  | Valor                            |
|-------|---------|----------------------------------|
| CNAME | ganamos | ganamos-landing.onrender.com     |

Volvé a Render. En 5-30 min vas a ver check verde y SSL automático.

## 4. Mantenelo despierto (plan free)

El plan free duerme tras 15 min sin uso.

- Registrate gratis en https://uptimerobot.com
- **+ Add New Monitor** → tipo HTTPS → URL: tu dominio → cada 5 minutos.

## Limitaciones del plan free

- **Disco efímero**: cada redeploy borra `uploads/` y la base JSON. Sirve para probar; para producción real, plan Starter (U$D 7/mes) o migrar a Railway/VPS.
- **750 horas/mes** gratis: alcanza para un servicio activo 24/7.

## Updates de código

```bash
git add .
git commit -m "lo que cambiaste"
git push
```

Render redeploya automáticamente.

## Troubleshooting

**"Cannot GET /"**: la carpeta `public/` no se subió. Verificá el repo en GitHub y volvé a subir solo esa carpeta si falta.

**Build falla**: revisá que `package.json` esté en la raíz del repo, no dentro de otra carpeta.

**Chat se desconecta**: si usás Cloudflare en frente, activá WebSockets en Cloudflare → Network.

**SSL no se emite**: DNS aún no propagado. Esperá 30 min más.

**404 en /admin**: faltan `ADMIN_USER` o `ADMIN_PASS` en env vars.
