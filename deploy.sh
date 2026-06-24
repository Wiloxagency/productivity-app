#!/usr/bin/env bash
#
# Deploy — Productivity App (tracker.wiloxagency.com)
# ---------------------------------------------------------------------------
# On each run this script:
#   1. Pulls the latest code from the 'master' branch
#   2. Installs deps + builds the API and the Frontend
#   3. (Re)deploys the Frontend (static build served by nginx)
#   4. (Re)deploys the Backend with PM2  (process: tracker-api)
#
# Routine deploys do NOT need sudo. The nginx site + HTTPS are a one-time
# setup — see DEPLOY.md.
#
# Usage:   ./deploy.sh            (or: bash deploy.sh)
# ---------------------------------------------------------------------------

set -Eeuo pipefail

# ===== Config (edit here if ever needed) ===================================
APP_DIR="/projects/productivity-app"
BRANCH="master"
PM2_NAME="tracker-api"
ECOSYSTEM="ecosystem.config.cjs"
# ===========================================================================

# --- pretty logging --------------------------------------------------------
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Falló el deploy en la línea $LINENO. No se aplicaron más pasos."' ERR

# --- helpers ---------------------------------------------------------------
# Use a reproducible install when a lockfile exists, otherwise fall back.
npm_install() {
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
}

# --- sanity checks ---------------------------------------------------------
command -v git  >/dev/null 2>&1 || die "git no está instalado"
command -v node >/dev/null 2>&1 || die "node no está instalado"
command -v npm  >/dev/null 2>&1 || die "npm no está instalado"
command -v pm2  >/dev/null 2>&1 || die "pm2 no está instalado (npm i -g pm2)"

cd "$APP_DIR" 2>/dev/null || die "No existe el directorio $APP_DIR"
[ -d "$APP_DIR/api" ] && [ -d "$APP_DIR/frontend" ] || die "Estructura inesperada en $APP_DIR"
[ -f "$APP_DIR/$ECOSYSTEM" ] || die "Falta $ECOSYSTEM en $APP_DIR"

START_TS=$(date +%s)
printf '\033[1;35m\n  Deploy » tracker.wiloxagency.com  (%s)\033[0m\n' "$(date '+%Y-%m-%d %H:%M:%S')"

# --- 1) pull ---------------------------------------------------------------
log "1/4  Actualizando código (git pull --ff-only origin $BRANCH)"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
ok "Repo en commit $(git rev-parse --short HEAD)"

# --- 2) build backend ------------------------------------------------------
log "2/4  Backend: instalando dependencias"
( cd api && npm_install )
if [ ! -f api/.env ]; then
  warn "No existe api/.env — el API necesita MONGODB_URI (y JWT_SECRET). Ver DEPLOY.md."
fi
ok "Dependencias del API listas"

# --- 3) build + deploy frontend -------------------------------------------
log "3/4  Frontend: instalando dependencias y compilando"
( cd frontend && npm_install && npm run build )
[ -d frontend/dist ] && [ -f frontend/dist/index.html ] || die "El build no generó frontend/dist/index.html"
ok "Frontend compilado → frontend/dist (servido por nginx)"

# --- 4) deploy backend (PM2) ----------------------------------------------
log "4/4  Backend: (re)deploy con PM2 [$PM2_NAME]"
mkdir -p logs
# startOrReload = arranca si no existe, recarga (zero-downtime) si ya corre.
# Solo afecta a las apps de este ecosystem; tus otros procesos quedan intactos.
pm2 startOrReload "$ECOSYSTEM" --update-env
pm2 save >/dev/null
ok "PM2 actualizado y guardado"

# --- summary ---------------------------------------------------------------
ELAPSED=$(( $(date +%s) - START_TS ))
printf '\n\033[1;32m  ✔ Deploy completado en %ss\033[0m\n' "$ELAPSED"
echo   "    • Frontend : $APP_DIR/frontend/dist"
echo   "    • Backend  : PM2 '$PM2_NAME' (puerto definido en $ECOSYSTEM)"
echo
pm2 status "$PM2_NAME" || true
