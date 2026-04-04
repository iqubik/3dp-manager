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

need_root() {
  [[ $EUID -eq 0 ]] || die "Запускать только от root"
}

#################################
# PARSE ARGS
#################################
PROJECT_DIR="/opt/3dp-manager"
SOURCE_DIR="/opt/3dp-manager-src"
REMOVE_HYSTERIA=0

while getopts ":p:s:hH" opt; do
  case "$opt" in
    p) PROJECT_DIR="$OPTARG" ;;
    s) SOURCE_DIR="$OPTARG" ;;
    H) REMOVE_HYSTERIA=1 ;;
    h)
      echo "Удаление 3dp-manager (custom-ветка dp-custom)"
      echo ""
      echo "Использование:"
      echo "  delete-custom.sh [-p <project_dir>] [-s <source_dir>] [-H]"
      echo ""
      echo "Параметры:"
      echo "  -p  Папка установки (по умолчанию: /opt/3dp-manager)"
      echo "  -s  Папка исходников (по умолчанию: /opt/3dp-manager-src)"
      echo "  -H  Удалить Hysteria 2 вместе с 3dp-manager"
      echo "  -h  Показать эту справку"
      echo ""
      echo "Пример:"
      echo "  delete-custom.sh -H"
      exit 0
      ;;
    :) die "Параметр -$OPTARG требует значение" ;;
    \?) die "Неизвестный параметр: -$OPTARG" ;;
  esac
done

#################################
# CONFIRMATION
#################################
read -r -p "Вы уверены, что хотите удалить 3dp-manager (custom)? (y/n): " answer

case "$answer" in
  y|Y)
    log "Начинаю удаление..."
    ;;
  *)
    log "Удаление отменено"
    exit 1
    ;;
esac

#################################
# START
#################################
need_root

log "Удаляем 3dp-manager (custom-ветка)"

#################################
# DOCKER COMPOSE DOWN
#################################
resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("docker" "compose")
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=("docker-compose")
  else
    warn "Docker Compose не найден — пропуск"
    COMPOSE_CMD=()
  fi
}

resolve_compose_cmd

if [[ ${#COMPOSE_CMD[@]} -gt 0 ]]; then
  # Попробуем с docker-compose.custom.yml (если есть)
  if [[ -d "$PROJECT_DIR" ]] && [[ -f "$PROJECT_DIR/docker-compose.yml" ]]; then
    cd "$PROJECT_DIR"
    if [[ -f "$PROJECT_DIR/docker-compose.custom.yml" ]]; then
      log "Останавливаем custom-контейнеры"
      "${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.custom.yml down --volumes --remove-orphans || warn "Ошибка при custom compose down"
    else
      log "Останавливаем контейнеры"
      "${COMPOSE_CMD[@]}" down --volumes --remove-orphans || warn "Ошибка при docker compose down"
    fi
  else
    # Попробуем остановить любые контейнеры 3dp-manager
    running=$(docker ps --filter "name=3dp-" --format '{{.Names}}' 2>/dev/null || true)
    if [[ -n "$running" ]]; then
      log "Найдены запущенные контейнеры 3dp: $running"
      docker stop $running || warn "Ошибка при остановке контейнеров"
      docker rm $running || warn "Ошибка при удалении контейнеров"
    fi
  fi
fi

#################################
# CLEAN IMAGES
#################################
log "Удаляем custom-образы (если есть)"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '3dp-manager-server:custom|3dp-manager-client:custom' \
  | xargs -r docker rmi -f 2>/dev/null || true

log "Удаляем образы 3dp-manager (общие)"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep '3dp-manager' \
  | xargs -r docker rmi -f 2>/dev/null || true

# Dangling images
docker image prune -f 2>/dev/null || true

#################################
# REMOVE HYSTERIA 2 (опционально)
#################################
if [[ $REMOVE_HYSTERIA -eq 1 ]]; then
  log "Удаление Hysteria 2..."

  if systemctl is-active --quiet hysteria-server 2>/dev/null; then
    systemctl stop hysteria-server || warn "Ошибка при остановке hysteria-server"
    systemctl disable hysteria-server || true
  fi

  # Удаляем systemd unit
  if [[ -f /etc/systemd/system/hysteria-server.service ]]; then
    rm -f /etc/systemd/system/hysteria-server.service
    systemctl daemon-reload
    log "Unit hysteria-server.service удалён"
  fi

  # Удаляем бинарник
  if command -v hysteria &>/dev/null; then
    HYSTERIA_BIN="$(command -v hysteria)"
    rm -f "$HYSTERIA_BIN"
    log "Бинарник hysteria удалён: $HYSTERIA_BIN"
  fi

  # Удаляем конфиг
  if [[ -f /etc/hysteria/config.yaml ]]; then
    rm -f /etc/hysteria/config.yaml
    log "Конфиг Hysteria удалён"
  fi

  # Удаляем firewall правила Hysteria
  if command -v ufw &>/dev/null; then
    # Удаляем правило для порта 8443 (если это только Hysteria)
    warn "Правила UFW для Hysteria (UDP 8443) нужно удалить вручную: sudo ufw status numbered"
  fi

  log "Hysteria 2 удалён"
else
  warn "Hysteria 2 НЕ удалён. Для удаления: delete-custom.sh -H"
fi

#################################
# FIREWALL — удалить правила 3dp-manager
#################################
if command -v ufw &>/dev/null; then
  log "Удаляем правила UFW для 3dp-manager..."
  # Удаляем правила для портов 443, 8443, 10000-20000, 30000-60000 (только те, что добавлял 3dp-manager)
  # Это может затронуть и другие сервисы, поэтому просто предупреждаем
  warn "Правила UFW (443, 8443, 10000-60000) нужно проверить/удалить вручную:"
  warn "sudo ufw status numbered"
fi

#################################
# REMOVE DIRECTORIES
#################################
log "Удаляем $PROJECT_DIR"
rm -rf "$PROJECT_DIR"

log "Удаляем $SOURCE_DIR"
rm -rf "$SOURCE_DIR"

#################################
# REMOVE SYSTEMD SERVICE (если есть)
#################################
if [[ -f /etc/systemd/system/3dp-manager.service ]]; then
  systemctl stop 3dp-manager 2>/dev/null || true
  systemctl disable 3dp-manager 2>/dev/null || true
  rm -f /etc/systemd/system/3dp-manager.service
  systemctl daemon-reload
  log "Systemd unit 3dp-manager.service удалён"
fi

#################################
# REMOVE CRON ENTRIES (если есть)
#################################
# Скрипты могли добавлять cron для автоматического обновления
# Проверяем cron текущего пользователя и root
for user in root "${SUDO_USER:-}"; do
  if [[ -n "$user" ]]; then
    cron_jobs=$(sudo -u "$user" crontab -l 2>/dev/null | grep -v '3dp-manager' || true)
    if [[ -z "$cron_jobs" ]]; then
      sudo -u "$user" crontab -r 2>/dev/null || true
      log "Cron jobs для $user удалены"
    else
      echo "$cron_jobs" | sudo -u "$user" crontab - 2>/dev/null || true
    fi
  fi
done

#################################
# DONE
#################################
log "✔ 3dp-manager (custom) полностью удалён"
log ""
log "Что было удалено:"
log "  • Контейнеры и образы Docker"
log "  • $PROJECT_DIR"
log "  • $SOURCE_DIR"
log ""
if [[ $REMOVE_HYSTERIA -eq 1 ]]; then
  log "  • Hysteria 2"
else
  warn "  Hysteria 2 НЕ удалён (используйте -H для удаления)"
fi
warn ""
warn "Проверьте вручную:"
warn "  • sudo ufw status numbered  — правила firewall"
warn "  • /etc/letsencrypt/live/     — SSL сертификаты (если были)"
