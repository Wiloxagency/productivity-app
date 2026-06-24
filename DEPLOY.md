# Deploy — Productivity App (`tracker.wiloxagency.com`)

Stack en el servidor Ubuntu:

- **Frontend** (Vite/React): se compila a `frontend/dist` y lo sirve **nginx** como estático.
- **Backend** (Express): corre con **PM2** como proceso **`tracker-api`** en `127.0.0.1:8730` (puerto no estándar para no chocar con tus otras APIs).
- **nginx** sirve el frontend y hace proxy de `/api/` al backend.

> El puerto del backend está definido en **un solo lugar**: `ecosystem.config.cjs` (`PORT: 8730`). Si lo cambias, actualiza también `proxy_pass` en `deploy/nginx/tracker.wiloxagency.com.conf`.

---

## 1. Setup inicial (una sola vez)

Ya tienes el repo clonado en `/projects/productivity-app` y PM2 funcionando. Ejecuta esto **una vez**:

```bash
cd /projects/productivity-app

# a) Crear el .env del API (NO está en git). Pega tu MONGODB_URI real.
cp api/.env.example api/.env
nano api/.env
#   MONGODB_URI=...        (tu Atlas o mongo local)
#   JWT_SECRET=...         (una cadena aleatoria larga)
#   NODE_ENV=production
#   (PORT se ignora aquí: lo fija ecosystem.config.cjs = 8730)

# b) Permitir ejecutar el script
chmod +x deploy.sh

# c) Primer deploy (pull + build + PM2)
./deploy.sh

# d) Asegurar que PM2 reviva tras reinicios (si aún no lo configuraste)
pm2 save
# Si nunca corriste 'pm2 startup' en este server, hazlo una vez y sigue la instrucción que imprime:
# pm2 startup
```

### nginx (una sola vez)

```bash
sudo cp deploy/nginx/tracker.wiloxagency.com.conf \
        /etc/nginx/sites-available/tracker.wiloxagency.com
sudo ln -s /etc/nginx/sites-available/tracker.wiloxagency.com \
           /etc/nginx/sites-enabled/
sudo nginx -t                       # valida sintaxis (no toca tus otros sitios)
sudo systemctl reload nginx         # recarga sin cortar las demás apps
```

Verifica: `http://tracker.wiloxagency.com` debe cargar la app, y `http://tracker.wiloxagency.com/api/activities` debe responder JSON.

> **Permisos:** nginx (`www-data`) necesita poder leer `frontend/dist`. Si ves 403, habilita el recorrido del path:
> ```bash
> sudo chmod o+x /projects /projects/productivity-app /projects/productivity-app/frontend
> ```

---

## 2. Deploys siguientes (rutina)

Cada vez que quieras publicar cambios:

```bash
cd /projects/productivity-app
./deploy.sh
```

Hace: `git pull master` → `npm ci` + build (API y frontend) → recarga `tracker-api` en PM2 (zero-downtime) → `pm2 save`. **No requiere sudo** y **no toca** tus otros procesos PM2 ni otros sitios de nginx. (nginx solo se recarga cuando cambias su config, no en cada deploy.)

---

## 3. HTTPS con Certbot (cuando quieras)

El sitio quedó en **HTTP** por ahora. Como el DNS ya apunta al servidor, cuando quieras SSL:

```bash
sudo certbot --nginx -d tracker.wiloxagency.com
```

Certbot edita automáticamente este `server {}` para añadir el bloque `443` y la redirección 80→443. No hace falta tocar el `.conf` a mano.

---

## 4. Comandos útiles

```bash
pm2 status tracker-api          # estado
pm2 logs tracker-api            # logs en vivo
pm2 restart tracker-api         # reinicio manual
pm2 describe tracker-api        # detalle (puerto, cwd, etc.)
tail -f logs/tracker-api.err.log
```

## 5. Troubleshooting

- **502 Bad Gateway** → el backend no está arriba o el puerto no coincide. Revisa `pm2 status tracker-api` y que `proxy_pass` use `8730`.
- **404 al refrescar una ruta interna** (p.ej. `/time-tracker`) → falta el fallback SPA; ya está cubierto con `try_files ... /index.html`.
- **API responde pero la DB no** → revisa `MONGODB_URI` en `api/.env` y `pm2 logs tracker-api`.
- **Puerto ocupado** → cambia `PORT` en `ecosystem.config.cjs` y `proxy_pass` en el `.conf`, luego `./deploy.sh` y `sudo systemctl reload nginx`.
