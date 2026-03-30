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

check_containers_running() {
  log "Проверка статуса контейнеров..."
  local timeout=${1:-60}
  local elapsed=0
  local failed=0

  while [ $elapsed -lt $timeout ]; do
    failed=0
    # Формат: NAME\tSTATUS (например: "3dp-postgres\tUp 2 days" или "3dp-postgres\tError")
    while IFS=$'\t' read -r container_name status; do
      if [ -n "$container_name" ] && [ -n "$status" ]; then
        # Проверяем, что статус содержит Up/running/healthy/restarting
        # Up, Up 2 days, Up Less than a second, (healthy), running, restarting
        if ! echo "$status" | grep -qiE "^up|running|healthy|restarting"; then
          failed=1
          warn "Контейнер $container_name в статусе: $status"
        fi
      fi
    done < <("${COMPOSE_CMD[@]}" ps --format "table {{.Name}}\t{{.Status}}" --all 2>/dev/null | tail -n +2)

    if [ $failed -eq 0 ]; then
      log "Все контейнеры запущены успешно"
      return 0
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  return 1
}

check_and_fix_credentials() {
  log "Проверка учётных данных на безопасность..."
  
  local env_file=".env"
  local compose_file="docker-compose.yml"
  local credentials_changed=0
  
  # Проверяем, существует ли .env файл
  if [[ ! -f "$env_file" ]]; then
    log "Создание .env файла с безопасными учётными данными..."
    
    # Генерируем случайные пароли
    local db_pass
    local jwt_secret
    local admin_login
    local admin_pass
    
    db_pass=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-12)
    jwt_secret=$(openssl rand -base64 32)
    admin_login=$(openssl rand -base64 8 | tr -dc 'A-Za-z0-9' | cut -c1-8)
    admin_pass=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-12)
    
    # Создаём .env файл
    cat > "$env_file" <<EOF
POSTGRES_USER=admin
POSTGRES_PASSWORD=${db_pass}
POSTGRES_DB=3dp_manager
JWT_SECRET=${jwt_secret}
ADMIN_LOGIN=${admin_login}
ADMIN_PASSWORD=${admin_pass}
EOF
    
    log "Сгенерированы новые учётные данные:"
    log "  ADMIN_LOGIN: ${admin_login}"
    log "  ADMIN_PASSWORD: ${admin_pass}"
    log "  POSTGRES_PASSWORD: ${db_pass}"
    log "  JWT_SECRET: ${jwt_secret}"
    log "⚠️ Сохраните эти данные в безопасном месте!"
    
    credentials_changed=1
  else
    # Проверяем, не используются ли дефолтные значения
    local admin_login_val
    local admin_pass_val
    local jwt_secret_val
    local db_pass_val
    
    admin_login_val=$(grep -E "^ADMIN_LOGIN=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    admin_pass_val=$(grep -E "^ADMIN_PASSWORD=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    jwt_secret_val=$(grep -E "^JWT_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    db_pass_val=$(grep -E "^POSTGRES_PASSWORD=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    
    local needs_update=0
    
    if [[ "$admin_login_val" == "admin" ]] || [[ -z "$admin_login_val" ]]; then
      warn "Обнаружен дефолтный ADMIN_LOGIN=admin"
      needs_update=1
    fi
    
    if [[ "$admin_pass_val" == "admin" ]] || [[ -z "$admin_pass_val" ]]; then
      warn "Обнаружен дефолтный ADMIN_PASSWORD=admin"
      needs_update=1
    fi
    
    if [[ "$jwt_secret_val" == "secretKey" ]] || [[ -z "$jwt_secret_val" ]]; then
      warn "Обнаружен дефолтный JWT_SECRET=secretKey"
      needs_update=1
    fi
    
    if [[ "$db_pass_val" == "admin" ]] || [[ -z "$db_pass_val" ]]; then
      warn "Обнаружен дефолтный POSTGRES_PASSWORD=admin"
      needs_update=1
    fi
    
    if [[ $needs_update -eq 1 ]]; then
      log "Генерация новых безопасных учётных данных..."
      
      # Генерируем новые пароли
      local new_db_pass
      local new_jwt_secret
      local new_admin_login
      local new_admin_pass
      
      new_db_pass=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-12)
      new_jwt_secret=$(openssl rand -base64 32)
      new_admin_login=$(openssl rand -base64 8 | tr -dc 'A-Za-z0-9' | cut -c1-8)
      new_admin_pass=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-12)
      
      # Сохраняем существующие значения, которые не нужно менять
      local existing_postgres_user
      existing_postgres_user=$(grep -E "^POSTGRES_USER=" "$env_file" 2>/dev/null | cut -d'=' -f2 || echo "admin")
      
      # Создаём новый .env файл
      cat > "$env_file" <<EOF
POSTGRES_USER=${existing_postgres_user:-admin}
POSTGRES_PASSWORD=${new_db_pass}
POSTGRES_DB=3dp_manager
JWT_SECRET=${new_jwt_secret}
ADMIN_LOGIN=${new_admin_login}
ADMIN_PASSWORD=${new_admin_pass}
EOF
      
      log "Сгенерированы новые учётные данные:"
      log "  ADMIN_LOGIN: ${new_admin_login}"
      log "  ADMIN_PASSWORD: ${new_admin_pass}"
      log "  POSTGRES_PASSWORD: ${new_db_pass}"
      log "  JWT_SECRET: ${new_jwt_secret}"
      log "⚠️ Сохраните эти данные в безопасном месте!"
      
      credentials_changed=1
    else
      log "Учётные данные безопасны ✅"
    fi
  fi
  
  return $credentials_changed
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
# CHECK AND FIX CREDENTIALS
#################################
check_and_fix_credentials || true

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

# Проверка: все ли контейнеры запустились
if ! check_containers_running 60; then
    error "Не удалось запустить контейнеры. Логи:"
    "${COMPOSE_CMD[@]}" logs --tail=50
    die "Обновление прервано из-за ошибки запуска контейнеров"
fi

log "Очистка старых Docker-образов (освобождение места)..."
docker image prune -f

#################################
# DONE
#################################
log "3dp-manager успешно обновлён ✅"
