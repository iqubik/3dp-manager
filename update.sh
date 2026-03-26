#!/usr/bin/env bash
set -euo pipefail

#################################
# TRAP
#################################
trap 'echo -e "\033[1;31m[ERROR]\033[0m Ошибка в строке $LINENO"; exit 1' ERR

#################################
# HELPERS
#################################
log()  { echo -e "\033[1;32m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
die()  { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("docker" "compose")
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=("docker-compose")
    return 0
  fi

  die "Не найден Docker Compose (ни v2 plugin, ни v1 binary)"
}

need_root() {
  [[ $EUID -eq 0 ]] || die "Запускать только от root"
}

#################################
# CONFIG
#################################
PROJECT_DIR="/opt/3dp-manager"

#################################
# START
#################################
need_root

log "Обновление 3dp-manager"

[[ -d "$PROJECT_DIR" ]] || die "3dp-manager не установлен ($PROJECT_DIR не найден)"

cd "$PROJECT_DIR"

#################################
# CHECK DOCKER
#################################
command -v docker >/dev/null 2>&1 || die "Docker не установлен"
resolve_compose_cmd
log "Compose команда: ${COMPOSE_CMD[*]}"

#################################
# REBUILD BACKEND
#################################
log "Скачивание последних версий Docker-образов..."
if "${COMPOSE_CMD[@]}" pull; then
    log "Образы успешно загружены."
else
    die "Ошибка при скачивании образов. Проверьте подключение к интернету или доступность GitHub Container Registry."
fi

log "Пересоздание контейнеров..."
"${COMPOSE_CMD[@]}" up -d

log "Очистка старых Docker-образов (освобождение места)..."
docker image prune -f

#################################
# DONE
#################################
log "3dp-manager успешно обновлён ✅"
