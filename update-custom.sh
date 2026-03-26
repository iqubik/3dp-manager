#!/usr/bin/env bash
set -euo pipefail

trap 'echo -e "\033[1;31m[ERROR]\033[0m Ошибка в строке $LINENO"; exit 1' ERR

log()  { echo -e "\033[1;32m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
die()  { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

usage() {
  cat <<'EOF'
Использование:
  update-custom.sh -r <repo_url> -b <branch> [-p <project_dir>] [-s <source_dir>]

Параметры:
  -r  Git URL вашего форка (обязательно), например:
      https://github.com/<user>/3dp-manager.git
  -b  Ветка с вашими правками (обязательно), например:
      dp-fix
  -p  Папка установленного 3dp-manager (по умолчанию /opt/3dp-manager)
  -s  Папка исходников для сборки (по умолчанию /opt/3dp-manager-src)
  -h  Показать эту справку

Пример:
  ./update-custom.sh -r https://github.com/me/3dp-manager.git -b dp-fix
EOF
}

need_root() {
  [[ $EUID -eq 0 ]] || die "Запускать только от root"
}

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

ensure_nginx_api_timeouts() {
  local nginx_conf="$1"
  [[ -f "$nginx_conf" ]] || return 0

  local tmp_file
  tmp_file="$(mktemp)"

  awk '
    BEGIN { in_api = 0; injected = 0 }
    {
      line = $0

      if (line ~ /^[[:space:]]*location[[:space:]]+\/api\/[[:space:]]*\{/) {
        in_api = 1
        injected = 0
      }

      if (in_api && line ~ /proxy_(connect|send|read)_timeout[[:space:]]+[0-9]+s;/) {
        next
      }

      print line

      if (in_api && line ~ /proxy_set_header[[:space:]]+X-Forwarded-For[[:space:]]+/ && injected == 0) {
        print "        proxy_connect_timeout 10s;"
        print "        proxy_send_timeout 650s;"
        print "        proxy_read_timeout 650s;"
        injected = 1
      }

      if (in_api && line ~ /^[[:space:]]*}/) {
        in_api = 0
        injected = 0
      }
    }
  ' "$nginx_conf" > "$tmp_file"

  mv "$tmp_file" "$nginx_conf"
}

REPO_URL=""
BRANCH=""
PROJECT_DIR="/opt/3dp-manager"
SOURCE_DIR="/opt/3dp-manager-src"

while getopts ":r:b:p:s:h" opt; do
  case "$opt" in
    r) REPO_URL="$OPTARG" ;;
    b) BRANCH="$OPTARG" ;;
    p) PROJECT_DIR="$OPTARG" ;;
    s) SOURCE_DIR="$OPTARG" ;;
    h)
      usage
      exit 0
      ;;
    :)
      die "Параметр -$OPTARG требует значение"
      ;;
    \?)
      die "Неизвестный параметр: -$OPTARG"
      ;;
  esac
done

[[ -n "$REPO_URL" ]] || { usage; die "Укажите -r <repo_url>"; }
[[ -n "$BRANCH" ]] || { usage; die "Укажите -b <branch>"; }

need_root

[[ -d "$PROJECT_DIR" ]] || die "Папка проекта не найдена: $PROJECT_DIR"
[[ -f "$PROJECT_DIR/docker-compose.yml" ]] || die "Не найден docker-compose.yml в $PROJECT_DIR"

command -v git >/dev/null 2>&1 || die "git не установлен"
command -v docker >/dev/null 2>&1 || die "docker не установлен"
resolve_compose_cmd
log "Compose команда: ${COMPOSE_CMD[*]}"

log "Подготовка исходников в $SOURCE_DIR"
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  if [[ -e "$SOURCE_DIR" ]]; then
    die "Путь $SOURCE_DIR существует, но это не git-репозиторий. Укажите другой -s или подготовьте папку вручную."
  fi
  git clone --single-branch --branch "$BRANCH" "$REPO_URL" "$SOURCE_DIR"
else
  cd "$SOURCE_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin "$BRANCH"

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
    # Merge from FETCH_HEAD to support repos cloned with --single-branch
    # where origin/<branch> may not exist.
    git merge --ff-only FETCH_HEAD || die "Не удалось fast-forward merge. Проверьте локальные изменения в $SOURCE_DIR."
  else
    git checkout -b "$BRANCH" FETCH_HEAD
  fi
fi

COMPOSE_OVERRIDE="$PROJECT_DIR/docker-compose.custom.yml"
cat > "$COMPOSE_OVERRIDE" <<EOF
services:
  backend:
    build: $SOURCE_DIR/server
    image: 3dp-manager-server:custom
  frontend:
    build: $SOURCE_DIR/client
    image: 3dp-manager-client:custom
EOF

ensure_nginx_api_timeouts "$PROJECT_DIR/client/nginx-client.conf"

log "Сборка custom-образов backend/frontend"
cd "$PROJECT_DIR"
"${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.custom.yml build backend frontend

log "Перезапуск контейнеров с custom-образами"
"${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.custom.yml up -d --remove-orphans backend frontend

log "Проверка статуса контейнеров"
"${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.custom.yml ps

if "${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.custom.yml exec -T backend sh -lc "command -v RealiTLScanner-linux-64 >/dev/null"; then
  log "Scanner binary найден в backend-контейнере"
else
  warn "Scanner binary не найден в backend-контейнере"
fi

log "Готово: VPS обновлен на ваш fork/branch"
