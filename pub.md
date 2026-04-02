# 📚 3DP-MANAGER — Полная карта работы скриптов и архитектуры

**Дата:** 2 апреля 2026 г.  
**Автор:** DenPiligrim (iqubik)  
**Ветка:** dp-custom

---

## 📖 Оглавление

1. [update-custom.sh — Детальная карта работы](#update-customsh-детальная-карта-работы)
2. [docker-compose.local.yml — Архитектура локального стенда](#docker-compose-localyml-архитектура-локального-стенда)
3. [install.sh — Процесс установки VPS](#installsh-процесс-установки-vps)
4. [update.sh — Процесс обновления VPS](#updatesh-процесс-обновления-vps)
5. [Сравнительная таблица функций](#сравнительная-таблица-функций)
6. [Критические отличия и требования](#критические-отличия-и-требования)

---

## 🔄 update-custom.sh — Детальная карта работы

### Назначение
Скрипт для **кастомного обновления** с произвольного Git-репозитория и ветки. Используется для:
- Тестирования новых функций на боевом VPS
- Разработки и отладки в реальных условиях
- Обновления из форков и кастомных веток

### Структура работы

```
┌─────────────────────────────────────────────────────────────────┐
│                    update-custom.sh                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  1. Парсинг аргументов командной строки │
        │     -r <repo_url> (обязательно)         │
        │     -b <branch> (обязательно)           │
        │     -p <project_dir> (опционально)      │
        │     -s <source_dir> (опционально)       │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  2. Проверка требований                 │
        │     - Запуск от root (need_root)        │
        │     - Наличие $PROJECT_DIR              │
        │     - docker-compose.yml существует     │
        │     - git установлен                    │
        │     - docker установлен                 │
        │     - resolve_compose_cmd (v2 или v1)   │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  3. check_and_fix_credentials()         │
        │     - Проверка .env файла               │
        │     - Замена admin/admin на случайные   │
        │     - Генерация безопасных паролей      │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  4. Подготовка исходников               │
        │     - Клонирование репозитория          │
        │     - Checkout на нужную ветку          │
        │     - Merge FETCH_HEAD (если нужно)     │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  5. Генерация docker-compose.custom.yml │
        │     - Переопределение backend build     │
        │     - Переопределение frontend build    │
        │     - Custom image tags                 │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  6. ensure_nginx_api_timeouts()         │
        │     - Добавление timeout'ов в /api/     │
        │     - Добавление timeout'ов в /bus/     │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  7. ensure_bus_location()               │
        │     - Проверка наличия /bus/ location   │
        │     - Добавление если отсутствует       │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  8. Сборка custom-образов               │
        │     - docker compose build backend      │
        │     - docker compose build frontend     │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  9. Перезапуск контейнеров              │
        │     - up -d --remove-orphans            │
        │     - Только backend и frontend         │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 10. check_containers_running()          │
        │     - Проверка статуса 60 секунд        │
        │     - Парсинг docker compose ps         │
        │     - Ожидание Up/healthy/restarting    │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 11. Проверка Scanner binary             │
        │     - command -v RealiTLScanner         │
        │     - Warning если не найден            │
        └─────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     ГОТОВО      │
                    └─────────────────┘
```

### Ключевые функции

#### `resolve_compose_cmd()`
**Назначение:** Автоматическое определение версии Docker Compose  
**Логика:**
1. Проверяет `docker compose version` (v2 plugin)
2. Проверяет `docker-compose` (v1 binary)
3. Завершается с ошибкой если ни одно не найдено

**Зачем:** Поддержка старых и новых систем (Ubuntu 20.04 → 24.04)

---

#### `check_containers_running(timeout=60)`
**Назначение:** Проверка успешного запуска всех контейнеров  
**Логика:**
1. Цикл с таймаутом (по умолчанию 60 сек)
2. Парсинг вывода `docker compose ps --format "table {{.Name}}\t{{.Status}}"`
3. Проверка статуса на соответствие: `Up`, `running`, `healthy`, `restarting`
4. Возврат `0` если все контейнеры работают, `1` если таймаут

**Зачем:** Предотвращение "молчаливого" падения контейнеров после обновления

---

#### `check_and_fix_credentials()`
**Назначение:** Автоматическая замена небезопасных учётных данных  
**Логика:**
1. Проверка существования `.env` файла
2. Если нет → генерация новых паролей:
   - `POSTGRES_PASSWORD` (12 символов)
   - `JWT_SECRET` (32 символа)
   - `ADMIN_LOGIN` (8 символов)
   - `ADMIN_PASSWORD` (12 символов)
3. Если есть → проверка на дефолтные значения:
   - `admin_login == "admin"`
   - `admin_password == "admin"`
   - `jwt_secret == "secretKey"`
   - `db_password == "admin"`
4. Замена на случайные при обнаружении небезопасных

**Зачем:** Безопасность по умолчанию, защита от admin/admin

---

#### `ensure_nginx_api_timeouts(nginx_conf)`
**Назначение:** Добавление timeout'ов в location /api/ и /bus/  
**Логика:**
1. Проверка существования файла конфига
2. AWK-парсинг:
   - Поиск `location /api/` или `location /bus/`
   - Удаление старых timeout'ов (если есть)
   - Добавление после `proxy_set_header X-Forwarded-For`:
     ```nginx
     proxy_connect_timeout 10s;
     proxy_send_timeout 650s;
     proxy_read_timeout 650s;
     ```

**Зачем:** Длительные операции сканирования доменов (5-10 мин)

---

#### `ensure_bus_location(nginx_conf)`
**Назначение:** Добавление location /bus/ если отсутствует  
**Логика:**
1. Проверка `grep -q "location /bus/"`
2. Если нет → AWK-инъекция после закрывающей `}` location /api/:
   ```nginx
   location /bus/ {
       proxy_pass http://backend:3000/bus/;
       proxy_set_header Host $http_host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_connect_timeout 10s;
       proxy_send_timeout 650s;
       proxy_read_timeout 650s;
   }
   ```

**Зачем:** Подписка `/bus/{uuid}` для клиентов

---

### Переменные окружения

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `-r` | (обязательно) | Git URL репозитория |
| `-b` | (обязательно) | Ветка для обновления |
| `-p` | `/opt/3dp-manager` | Папка установки |
| `-s` | `/opt/3dp-manager-src` | Папка исходников для сборки |

---

## 🐳 docker-compose.local.yml — Архитектура локального стенда

### Назначение
**Локальная разработка** на Windows/PowerShell с учётом ограничений:
- Hyper-V блокирует порт 3000
- Требуется изоляция от production-конфигурации
- Безопасность (скрытые порты БД и бэкенда)

### Структура сервисов

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Network: app-network                  │
│                                                                 │
│  ┌─────────────────┐                                           │
│  │   postgres      │                                           │
│  │   :5432         │ ◄────────────────┐                        │
│  │   (СКРЫТ)       │                  │                        │
│  └────────┬────────┘                  │                        │
│           │                           │                        │
│           ▼                           │                        │
│  ┌─────────────────┐                  │                        │
│  │   server        │                  │                        │
│  │   :3000         │ ◄────────────────┤                        │
│  │   (СКРЫТ)       │                  │                        │
│  │   alias:backend │                  │                        │
│  └────────┬────────┘                  │                        │
│           │                           │                        │
│           ▼                           │                        │
│  ┌─────────────────┐                  │                        │
│  │   frontend      │                  │                        │
│  │   :80           │ ─────────────────┼──► 8080:80 (наружу)   │
│  │   (nginx)       │                  │                        │
│  └─────────────────┘                  │                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Детали сервисов

#### **postgres**
```yaml
image: postgres:18-alpine
container_name: 3dp-postgres-local
env_file: .env
environment:
  POSTGRES_USER: ${POSTGRES_USER}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  POSTGRES_DB: ${POSTGRES_DB}
# ports:  # ← ЗАКОММЕНТИРОВАНО (скрыт из сети)
volumes:
  - pg_data_local:/var/lib/postgresql/data
networks:
  - app-network
```

**Ключевые особенности:**
- ✅ **Скрыт из внешней сети** (ports закомментированы)
- ✅ Доступен только сервису `server` внутри `app-network`
- ✅ Использует `.env` для переменных
- ✅ Отдельный volume `pg_data_local`

---

#### **server** (backend)
```yaml
build: ./server
container_name: 3dp-server-local
env_file: .env
environment:
  DB_HOST: postgres          # ← Имя сервиса, не localhost!
  DB_PORT: 5432              # ← Внутренний порт, не 15432!
  DB_USERNAME: ${POSTGRES_USER}
  DB_PASSWORD: ${POSTGRES_PASSWORD}
  DB_NAME: ${POSTGRES_DB}
  JWT_SECRET: ${JWT_SECRET}
  ADMIN_LOGIN: ${ADMIN_LOGIN}
  ADMIN_PASSWORD: ${ADMIN_PASSWORD}
  PORT: ${PORT}
  LOG_LEVEL: debug
# ports:  # ← ЗАКОММЕНТИРОВАНО (скрыт из сети)
networks:
  app-network:
    aliases:
      - backend              # ← Алиас для nginx proxy_pass
```

**Ключевые особенности:**
- ✅ **Скрыт из внешней сети** (ports закомментированы)
- ✅ Доступен только через nginx proxy (`/api/`, `/bus/`)
- ✅ Алиас `backend` для совместимости с nginx.conf
- ✅ `DB_HOST=postgres` (имя сервиса Docker)
- ✅ `DB_PORT=5432` (внутренний порт PostgreSQL)

---

#### **frontend**
```yaml
build: ./client
container_name: 3dp-frontend-local
env_file: .env
environment:
  - VITE_API_URL=/api
  - VITE_LOG_LEVEL=debug
  - VITE_SEND_LOGS_TO_BACKEND=true
  - VITE_APP_VERSION=2.1.2
ports:
  - "8080:80"  # ← ЕДИНСТВЕННЫЙ ОТКРЫТЫЙ ПОРТ
depends_on:
  - server
networks:
  - app-network
```

**Ключевые особенности:**
- ✅ **Единственный открытый порт** — 8080→80
- ✅ nginx внутри контейнера проксирует на `server:3000`
- ✅ Все API вызовы через `/api/` → backend
- ✅ Подписки через `/bus/` → backend

---

### .env для локального стенда

```bash
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DB=3dp_manager
JWT_SECRET=localDevSecretKey12345678901234567890
ADMIN_LOGIN=admin
ADMIN_PASSWORD=admin
PORT=3000
LOG_LEVEL=debug
```

**Важно:**
- ⚠️ **Не использовать на production!**
- ⚠️ Только для локальной разработки
- ⚠️ `.env` игнорируется git (добавить в .gitignore)

---

### Таблица портов локального стенда

| Сервис | Внутренний порт | Внешний порт | Доступ |
|--------|-----------------|--------------|--------|
| **postgres** | 5432 | ❌ Скрыт | Только server |
| **server** | 3000 | ❌ Скрыт | Только frontend |
| **frontend** | 80 | ✅ 8080 | Публичный |

---

## 📦 install.sh — Процесс установки VPS

### Назначение
**Полная установка** 3dp-manager на чистый VPS (Ubuntu/Debian) с:
- Автоматической настройкой SSL (опционально)
- Установкой Hysteria 2
- Настройкой firewall (UFW)
- Генерацией безопасных паролей

### Этапы работы

```
┌─────────────────────────────────────────────────────────────────┐
│                      install.sh                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  1. Проверка root прав                  │
        │     - need_root                         │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  2. Проверка Docker                     │
        │     - Установка если нет                │
        │     - resolve_compose_cmd               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  3. Запрос домена для SSL               │
        │     - UI_HOST                           │
        │     - SKIP_SSL_SETUP                    │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  4. Поиск SSL сертификатов              │
        │     - /etc/letsencrypt/live/$UI_HOST    │
        │     - Автоматическое обнаружение        │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  5. Генерация случайных портов          │
        │     - FINAL_PORT (443 для HTTPS)        │
        │     - Диапазон 3000-6999                │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  6. Генерация паролей                   │
        │     - DB_PASS (12 символов)             │
        │     - JWT_SECRET (32 символа)           │
        │     - ADMIN_USER (8 символов)           │
        │     - ADMIN_PASS (12 символов)          │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  7. Логирование учётных данных          │
        │     - Вывод на экран                    │
        │     - ⚠️ СОХРАНИТЕ В БЕЗОПАСНОМ МЕСТЕ!  │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  8. Установка Hysteria 2                │
        │     - Проверка сервиса                  │
        │     - Порт 10000-20000                  │
        │     - ACME Let's Encrypt                │
        │     - Salamander obfuscation            │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  9. Генерация server/.env               │
        │     - DB_HOST=localhost (для .env)      │
        │     - DB_PORT=5432                      │
        │     - DB_USERNAME=admin                 │
        │     - DB_PASSWORD=${DB_PASS}            │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 10. Генерация nginx конф                │
        │     - SSL или HTTP версия               │
        │     - location /                        │
        │     - location /api/                    │
        │     - location /bus/ ✅                 │
        │     - proxy timeouts ✅                 │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 11. Генерация docker-compose.yml        │
        │     - postgres (с healthcheck)          │
        │     - backend                           │
        │     - frontend                          │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 12. Сборка и запуск                     │
        │     - docker compose up --build -d      │
        │     - check_containers_running(60)      │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ 13. Настройка UFW                       │
        │     - Открыть FINAL_PORT                │
        │     - Открыть порты Hysteria            │
        │     - Открыть 10000-60000 TCP/UDP       │
        └─────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     ГОТОВО      │
                    └─────────────────┘
```

### Генерация nginx.conf (SSL версия)

```nginx
server {
    listen 443 ssl;
    server_name $UI_HOST;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 50M;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://backend:3000/api/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 10s;
        proxy_send_timeout 650s;
        proxy_read_timeout 650s;
    }
    location /bus/ {  # ✅ ДОБАВЛЕНО
        proxy_pass http://backend:3000/bus/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 10s;
        proxy_send_timeout 650s;
        proxy_read_timeout 650s;
    }
}
server {
    listen 3000 ssl;
    server_name $UI_HOST;
    client_max_body_size 50M;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### Генерация docker-compose.yml (SSL версия)

```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: 3dp-postgres
    restart: always
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: 3dp_manager
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d 3dp_manager"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  backend:
    image: ${IMAGE_SERVER}
    container_name: 3dp-backend
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: admin
      DB_PASSWORD: ${DB_PASS}
      DB_NAME: 3dp_manager
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_LOGIN: ${ADMIN_USER}
      ADMIN_PASSWORD: ${ADMIN_PASS}
      PORT: 3000
    volumes:
      - /etc/hysteria/config.yaml:/etc/hysteria/config.yaml:ro
    networks:
      - app-network

  frontend:
    image: ${IMAGE_CLIENT}
    container_name: 3dp-frontend
    restart: always
    depends_on:
      - backend
    ports:
      - "${FINAL_PORT}:443"
      - "3000:3000"  # ⚠️ ОТКРЫТ ДЛЯ ОТЛАДКИ
    volumes:
      - ./client/nginx-client.conf:/etc/nginx/conf.d/default.conf:ro
      - ${CERT_PATH}:/etc/nginx/certs/fullchain.pem:ro
      - ${KEY_PATH}:/etc/nginx/certs/privkey.pem:ro
    networks:
      - app-network
```

---

## 🔄 update.sh — Процесс обновления VPS

### Назначение
**Обновление production** установки из официальных Docker образов (GHCR):
- Быстрое обновление без сборки
- Скачивание готовых образов
- Сохранение данных и настроек

### Этапы работы

```
┌─────────────────────────────────────────────────────────────────┐
│                       update.sh                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  1. Проверка root прав                  │
        │     - need_root                         │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  2. Проверка Docker                     │
        │     - resolve_compose_cmd               │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  3. check_and_fix_credentials()         │
        │     - Проверка .env                     │
        │     - Замена admin/admin                │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  4. Скачивание Docker образов           │
        │     - docker compose pull               │
        │     - ghcr.io/denpiligrim/...           │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  5. Пересоздание контейнеров            │
        │     - docker compose up -d              │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  6. check_containers_running()          │
        │     - Проверка статуса 60 секунд        │
        │     - Логи при ошибке                   │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  7. Очистка старых образов              │
        │     - docker image prune -f             │
        └─────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     ГОТОВО      │
                    └─────────────────┘
```

### Ключевые отличия от update-custom.sh

| Характеристика | update.sh | update-custom.sh |
|----------------|-----------|------------------|
| **Источник** | GHCR Docker images | Git репозиторий |
| **Сборка** | Нет (готовые образы) | Да (локальная сборка) |
| **Скорость** | Быстро (2-5 мин) | Медленно (5-15 мин) |
| **Гибкость** | Только релизы | Любая ветка/форк |
| **Требования** | Docker | Docker + Git |
| **Исходники** | Не нужны | Клонируются в -s |

---

## 📊 Сравнительная таблица функций

| Функция | install.sh | update.sh | update-custom.sh | docker-compose.local.yml |
|---------|------------|-----------|------------------|--------------------------|
| `resolve_compose_cmd()` | ✅ | ✅ | ✅ | ❌ (не скрипт) |
| `check_containers_running()` | ✅ | ✅ | ✅ | ❌ (не скрипт) |
| `check_and_fix_credentials()` | ❌ | ✅ | ✅ | ❌ |
| `ensure_nginx_api_timeouts()` | ❌ | ❌ | ✅ | ❌ |
| `ensure_bus_location()` | ❌ | ❌ | ✅ | ❌ |
| Генерация паролей | ✅ | ❌ | ❌ | ❌ |
| Логирование учётных данных | ✅ | ❌ | ❌ | ❌ |
| Установка Hysteria 2 | ✅ | ❌ | ❌ | ❌ |
| Настройка UFW | ✅ | ❌ | ❌ | ❌ |
| SSL сертификаты | ✅ | ❌ | ❌ | ❌ |
| Сборка образов | ❌ | ❌ | ✅ | ✅ (локально) |
| Pull образов | ❌ | ✅ | ❌ | ❌ |

---

## ⚠️ Критические отличия и требования

### 1. /bus/ location

**Где должно быть:**
- ✅ `install.sh` — генерация nginx.conf (SSL и HTTP версии)
- ✅ `update-custom.sh` — `ensure_bus_location()` для существующих
- ✅ `client/nginx.conf` — локальная разработка
- ❌ `update.sh` — не требуется (образы готовые)

**Почему важно:**
- Без `/bus/` подписки не работают (404)
- Ссылки вида `https://domain.com/bus/{uuid}`

---

### 2. Proxy timeouts

**Где должно быть:**
- ✅ `install.sh` — генерация nginx.conf
- ✅ `update-custom.sh` — `ensure_nginx_api_timeouts()`
- ✅ `client/nginx.conf` — локальная разработка

**Значения:**
```nginx
proxy_connect_timeout 10s;
proxy_send_timeout 650s;   # ~11 минут
proxy_read_timeout 650s;
```

**Почему важно:**
- Скан доменов занимает 5-10 минут
- Без timeout'ов nginx обрывает соединение (504)

---

### 3. Безопасность учётных данных

**Где проверяется:**
- ✅ `update.sh` — `check_and_fix_credentials()`
- ✅ `update-custom.sh` — `check_and_fix_credentials()`
- ❌ `install.sh` — генерирует случайные сразу

**Дефолтные значения для замены:**
- `ADMIN_LOGIN=admin`
- `ADMIN_PASSWORD=admin`
- `JWT_SECRET=secretKey`
- `POSTGRES_PASSWORD=admin`

---

### 4. Docker Compose переменные

**install.sh генерирует:**
```yaml
backend:
  environment:
    PORT: 3000  # ← Жёстко задано
```

**docker-compose.yml (авторский):**
```yaml
backend:
  environment:
    PORT: ${PORT}  # ← Из .env
```

**docker-compose.local.yml:**
```yaml
backend:
  environment:
    PORT: ${PORT}      # ← Из .env
    LOG_LEVEL: debug   # ← Для отладки
```

---

### 5. Скрытые порты (безопасность)

**Production (install.sh):**
```yaml
frontend:
  ports:
    - "${FINAL_PORT}:443"
    - "3000:3000"  # ⚠️ ОТКРЫТ ДЛЯ ОТЛАДКИ
```

**Local (docker-compose.local.yml):**
```yaml
postgres:
  # ports:  # ← СКРЫТ
server:
  # ports:  # ← СКРЫТ
frontend:
  ports:
    - "8080:80"  # ← ЕДИНСТВЕННЫЙ ОТКРЫТЫЙ
```

**Рекомендация для author code:**
- Убрать `"3000:3000"` из production
- Оставить только `${FINAL_PORT}:443` (или `:80` для HTTP)

---

## 📝 Чек-лист для переноса в авторский код

### ✅ Выполнено (dp-custom)

- [x] `client/nginx.conf` — `/bus/` location добавлен
- [x] `install.sh` — `/bus/` в SSL и HTTP секциях
- [x] `install.sh` — proxy timeouts в `/api/`
- [x] `update.sh` — `check_and_fix_credentials()`
- [x] `update.sh` — `check_containers_running()`
- [x] `update.sh` — `resolve_compose_cmd()`
- [x] `docker-compose.yml` — переменные без дефолтов
- [x] `docker-compose.yml` — `PORT` и `LOG_LEVEL` в backend

### ⚠️ Требует решения

- [ ] Убрать `"3000:3000"` из `install.sh` (production безопасность)
- [ ] Добавить `LOG_LEVEL` в `install.sh` docker-compose генерацию
- [ ] Добавить `ensure_bus_location()` в `update.sh` (для старых установок)

---

## 🔗 Ссылки

- Репозиторий: `https://github.com/iqubik/3dp-manager`
- Ветка dp-custom: `https://github.com/iqubik/3dp-manager/tree/dp-custom`
- Telegram: `@denpiligrim_web`
- YouTube: `DenPiligrim`

---

**Документ актуален на:** 2 апреля 2026 г.  
**Версия 3dp-manager:** 2.1.2

---

## 🔍 АУДИТ update.sh (ОБНОВЛЕНО ✅)

### ✅ Исправлено (добавлены функции)

| Функция | Было | Стало | Статус |
|---------|------|-------|--------|
| `ensure_nginx_api_timeouts()` | ❌ Отсутствует | ✅ Добавлена | ✅ Исправлено |
| `ensure_bus_location()` | ❌ Отсутствует | ✅ Добавлена | ✅ Исправлено |
| Вызов функций | ❌ Нет | ✅ После credentials | ✅ Исправлено |
| `restart frontend` | ❌ Нет | ✅ Добавлен | ✅ Исправлено |

### 📋 Актуальная структура update.sh

```
1. Trap ERR
2. Helpers (log, warn, die)
3. resolve_compose_cmd()          ✅
4. check_containers_running()     ✅
5. check_and_fix_credentials()    ✅
6. ensure_nginx_api_timeouts()    ✅ НОВОЕ
7. ensure_bus_location()          ✅ НОВОЕ
8. need_root()
9. Проверка директорий
10. check_and_fix_credentials || true
11. ensure_nginx_api_timeouts     ✅ НОВОЕ
12. ensure_bus_location           ✅ НОВОЕ
13. docker compose pull
14. docker compose up -d
15. docker compose restart frontend ✅ НОВОЕ
16. check_containers_running()    ✅
17. docker image prune -f
```

---

## 🐳 АУДИТ docker-compose.yml vs docker-compose.local.yml

### docker-compose.yml (production)

**Назначение:** Production окружение на VPS

**Структура:**
```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: 3dp-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}      # ✅ Без дефолтов
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"  # ⚠️ ОТКРЫТ (требуется для отладки?)
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - app-network

  backend:
    build: ./server
    container_name: 3dp-backend
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_LOGIN: ${ADMIN_LOGIN}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      PORT: ${PORT}           ✅
      LOG_LEVEL: ${LOG_LEVEL} ✅
    ports:
      - "${PORT}:${PORT}"  # ⚠️ ОТКРЫТ (требуется для отладки?)
    networks:
      - app-network

  frontend:
    build: ./client
    container_name: 3dp-frontend
    ports:
      - "80:80"  # ✅ Только frontend
    networks:
      - app-network
```

**Проблемы безопасности:**
| Сервис | Порт | Проблема | Рекомендация |
|--------|------|----------|--------------|
| postgres | 5432:5432 | ⚠️ Открыт наружу | Закомментировать для production |
| backend | ${PORT}:${PORT} | ⚠️ Открыт наружу | Закомментировать для production |
| frontend | 80:80 | ✅ Только frontend | OK |

**Рекомендуемые изменения:**
```yaml
# postgres
    # ports:  # Скрыт внутри Docker network
    #   - "5432:5432"

# backend
    # ports:  # Скрыт внутри Docker network
    #   - "${PORT}:${PORT}"
```

---

### docker-compose.local.yml (local development)

**Назначение:** Локальная разработка на Windows/PowerShell

**Структура:**
```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: 3dp-postgres-local
    env_file: .env  ✅
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    # ports:  ✅ СКРЫТ
    volumes:
      - pg_data_local:/var/lib/postgresql/data
    networks:
      - app-network

  server:  # ← Другое имя (не backend)
    build: ./server
    container_name: 3dp-server-local
    env_file: .env  ✅
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_LOGIN: ${ADMIN_LOGIN}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      PORT: ${PORT}
      LOG_LEVEL: debug  ✅
    # ports:  ✅ СКРЫТ
    networks:
      app-network:
        aliases:
          - backend  ✅ Алиас для nginx

  frontend:
    build: ./client
    container_name: 3dp-frontend-local
    env_file: .env  ✅
    environment:
      - VITE_API_URL=/api
      - VITE_LOG_LEVEL=debug
      - VITE_SEND_LOGS_TO_BACKEND=true
      - VITE_APP_VERSION=2.1.2
    ports:
      - "8080:80"  # ✅ Только frontend
    networks:
      - app-network
```

**Преимущества local версии:**
| Характеристика | docker-compose.yml | docker-compose.local.yml |
|----------------|-------------------|--------------------------|
| **env_file** | ❌ Нет | ✅ Есть (.env) |
| **Скрытые порты** | ❌ Нет | ✅ Есть |
| **LOG_LEVEL** | ✅ Есть | ✅ Есть (debug) |
| **VITE_* переменные** | ❌ Нет | ✅ Есть |
| **Алиас backend** | ❌ Нет | ✅ Есть |
| **Имя сервиса** | backend | server (с алиасом) |

---

### 🔴 КРИТИЧЕСКИЕ РАЗЛИЧИЯ между production и local

#### 1. env_file

**docker-compose.yml:**
```yaml
# Нет env_file - переменные только из shell
```

**docker-compose.local.yml:**
```yaml
env_file: .env  # ✅ Читает переменные из файла
```

**Проблема:** docker-compose.yml не читает .env автоматически для всех сервисов

**Решение для production:**
```yaml
services:
  postgres:
    env_file: .env  # Добавить
  backend:
    env_file: .env  # Добавить
  frontend:
    env_file: .env  # Добавить
```

---

#### 2. Переменные frontend

**docker-compose.yml:**
```yaml
frontend:
  # Нет VITE_* переменных
```

**docker-compose.local.yml:**
```yaml
frontend:
  environment:
    - VITE_API_URL=/api
    - VITE_LOG_LEVEL=debug
    - VITE_SEND_LOGS_TO_BACKEND=true
    - VITE_APP_VERSION=2.1.2
```

**Проблема:** Production frontend не получает переменные окружения

**Решение:**
```yaml
frontend:
  environment:
    - VITE_API_URL=/api
    - VITE_LOG_LEVEL=info
    - VITE_SEND_LOGS_TO_BACKEND=true
    - VITE_APP_VERSION=2.1.2
```

---

#### 3. Имя сервиса backend

**docker-compose.yml:**
```yaml
backend:  # ← Имя "backend"
  container_name: 3dp-backend
```

**docker-compose.local.yml:**
```yaml
server:  # ← Имя "server"
  container_name: 3dp-server-local
  networks:
    app-network:
      aliases:
        - backend  # ← Алиас для совместимости
```

**Проблема:** nginx.conf использует `proxy_pass http://backend:3000`

**Решение:**
- ✅ docker-compose.local.yml имеет алиас `backend` — OK
- ⚠️ docker-compose.yml использует имя `backend` — OK

**Вывод:** Конфликта нет, но nginx.conf должен использовать `backend`

---

#### 4. Healthcheck для postgres

**docker-compose.yml:**
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U admin -d 3dp_manager"]
    interval: 5s
    timeout: 5s
    retries: 5
```

**docker-compose.local.yml:**
```yaml
postgres:
  # Нет healthcheck ❌
```

**Проблема:** local версия не проверяет готовность БД

**Решение:** Добавить healthcheck в docker-compose.local.yml

---

### 📊 Сводная таблица различий

| Характеристика | docker-compose.yml | docker-compose.local.yml |
|----------------|-------------------|--------------------------|
| **env_file** | ❌ Нет | ✅ Есть |
| **Скрытые порты** | ❌ Нет | ✅ Есть |
| **Healthcheck postgres** | ✅ Есть | ❌ Нет |
| **VITE_* переменные** | ❌ Нет | ✅ Есть |
| **LOG_LEVEL** | ✅ ${LOG_LEVEL} | ✅ debug |
| **Алиас backend** | ❌ Нет | ✅ Есть |
| **Имя сервиса** | backend | server |
| **Порт frontend** | 80:80 | 8080:80 |
| **Volumes** | pg_data | pg_data_local |

---

## 📝 ИТОГОВЫЙ ЧЕК-ЛИСТ (ОБНОВЛЕНО)

### ✅ Выполнено (dp-custom)

- [x] client/nginx.conf — `/bus/` location
- [x] install.sh — `/bus/` в SSL и HTTP секциях
- [x] install.sh — proxy timeouts в `/api/`
- [x] update.sh — `check_and_fix_credentials()`
- [x] update.sh — `check_containers_running()`
- [x] update.sh — `resolve_compose_cmd()`
- [x] update.sh — `ensure_bus_location()` ✅ НОВОЕ
- [x] update.sh — `ensure_nginx_api_timeouts()` ✅ НОВОЕ
- [x] update.sh — вызов функций + `restart frontend` ✅ НОВОЕ
- [x] docker-compose.yml — переменные без дефолтов
- [x] docker-compose.yml — `PORT` и `LOG_LEVEL` в backend

### ⚠️ Требуется добавить (ОБНОВЛЕНО)

- [ ] **docker-compose.yml** — добавить `env_file: .env` для всех сервисов
- [ ] **docker-compose.yml** — добавить VITE_* переменные во frontend
- [ ] **docker-compose.yml** — закомментировать ports у postgres и backend (безопасность)
- [ ] **docker-compose.local.yml** — добавить healthcheck для postgres
- [ ] **client/vite.config.ts** — server.proxy и test конфиг
- [ ] **client/vitest.config.ts** — новый файл
- [ ] **install.sh** — убрать `"3000:3000"` из frontend ports (безопасность)
- [ ] **install.sh** — добавить `env_file` и VITE_* в docker-compose генерацию

---

## 🔍 АУДИТ update.sh vs update-custom.sh (по состоянию на 2 апреля 2026)

### ✅ Перенесённые функции в update.sh

| Функция | update-custom.sh | update.sh | Статус |
|---------|------------------|-----------|--------|
| `resolve_compose_cmd()` | ✅ Есть | ✅ Есть | ✅ Полностью перенесена |
| `check_containers_running()` | ✅ Есть | ✅ Есть | ✅ Полностью перенесена |
| `check_and_fix_credentials()` | ✅ Есть | ✅ Есть | ✅ Полностью перенесена |
| `usage()` | ✅ Есть | ❌ Нет | ⚠️ Не требуется (нет CLI аргументов) |
| `ensure_nginx_api_timeouts()` | ✅ Есть | ✅ Есть | ✅ ИСПРАВЛЕНО |
| `ensure_bus_location()` | ✅ Есть | ✅ Есть | ✅ ИСПРАВЛЕНО | |

---

### ✅ ИСПРАВЛЕНО (были критические отсутствия)

#### ~~1. Отсутствие ensure_bus_location() и ensure_nginx_api_timeouts()~~ ✅ ИСПРАВЛЕНО

**Было:**
- update.sh обновляет только Docker образы
- nginx-client.conf на VPS остаётся со старой версией
- **/bus/ location НЕ добавляется автоматически**
- **proxy timeouts НЕ добавляются автоматически**

**Стало:**
- ✅ Добавлены функции `ensure_nginx_api_timeouts()` и `ensure_bus_location()`
- ✅ Вызов функций после `check_and_fix_credentials`
- ✅ Перезапуск frontend для применения nginx.conf
- ✅ Проверка контейнеров после перезапуска

**Актуальный код в update.sh:**
```bash
#################################
# CHECK AND FIX CREDENTIALS
#################################
check_and_fix_credentials || true

#################################
# FIX NGINX CONFIG
#################################
ensure_nginx_api_timeouts "$PROJECT_DIR/client/nginx-client.conf"
ensure_bus_location "$PROJECT_DIR/client/nginx-client.conf"

#################################
# REBUILD BACKEND
#################################
log "Скачивание последних версий Docker-образов..."
if "${COMPOSE_CMD[@]}" pull; then
    log "Образы успешно загружены."
else
    die "Ошибка при скачивании образов..."
fi

log "Пересоздание контейнеров..."
"${COMPOSE_CMD[@]}" up -d

# Перезапуск frontend для применения nginx.conf
"${COMPOSE_CMD[@]}" restart frontend

# Проверка: все ли контейнеры запустились
if ! check_containers_running 60; then
    error "Не удалось запустить контейнеры. Логи:"
    "${COMPOSE_CMD[@]}" logs --tail=50
    die "Обновление прервано..."
fi
```

---

### 📋 Сравнение структур скриптов

#### update-custom.sh (385 строк)
```
1. Trap ERR
2. Helpers (log, warn, die, usage)
3. resolve_compose_cmd()
4. check_containers_running()
5. check_and_fix_credentials()
6. ensure_nginx_api_timeouts()
7. ensure_bus_location()
8. Парсинг аргументов (-r, -b, -p, -s)
9. need_root()
10. Проверка директорий
11. check_and_fix_credentials || true
12. Подготовка исходников (git clone/fetch/merge)
13. Генерация docker-compose.custom.yml
14. ensure_nginx_api_timeouts()
15. ensure_bus_location()
16. Сборка custom-образов
17. Перезапуск контейнеров
18. check_containers_running()
19. Проверка RealiTLScanner
```

#### update.sh (332 строки) ✅ ОБНОВЛЕНО
```
1. Trap ERR
2. Helpers (log, warn, die)
3. resolve_compose_cmd()          ✅
4. check_containers_running()     ✅
5. check_and_fix_credentials()    ✅
6. ensure_nginx_api_timeouts()    ✅ НОВОЕ
7. ensure_bus_location()          ✅ НОВОЕ
8. need_root()
9. Проверка директорий
10. check_and_fix_credentials || true
11. ensure_nginx_api_timeouts     ✅ НОВОЕ
12. ensure_bus_location           ✅ НОВОЕ
13. docker compose pull
14. docker compose up -d
15. docker compose restart frontend ✅ НОВОЕ
16. check_containers_running()    ✅
17. docker image prune -f
```

**Отсутствует в update.sh:**
- ❌ usage() — не требуется (нет CLI аргументов)
- ❌ Парсинг аргументов (-r, -b, -p, -s) — не требуется
- ❌ Подготовка исходников — не требуется (Docker images)
- ❌ Генерация docker-compose.custom.yml — не требуется
- ❌ Проверка RealiTLScanner — не требуется (есть в Dockerfile)

---

## 📦 Vite и Vitest — как работают в проекте

### vite.config.ts

**Статус:** Изменён в dp-custom (относительно upstream/main)

**Изменения:**
```typescript
// Добавлено в dp-custom:
server: {
  port: 8080,
  proxy: {
    '/api': {
      target: 'http://localhost:3100',  // ← Порт 3100 (Hyper-V)
      changeOrigin: true
    },
    '/bus': {
      target: 'http://localhost:3100',  // ← /bus проксирование
      changeOrigin: true
    }
  }
},
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './test/setup.ts',
  pool: 'forks',
  poolOptions: {
    forks: {
      maxForks: 4,
      minForks: 1,
    },
  },
}
```

**Назначение:**
- **Dev server** для локальной разработки (`npm run dev`)
- **Proxy** на backend (порт 3100 из-за Hyper-V)
- **Конфигурация тестов** Vitest

---

### vitest.config.ts

**Статус:** НОВЫЙ файл в dp-custom (отсутствует в upstream/main)

**Содержимое:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // ← Алиас для импортов
    },
  },
  server: {
    port: 8080,
    proxy: {
      '/api': { target: 'http://localhost:3100' },
      '/bus': { target: 'http://localhost:3100' }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    css: true,                    // ← CSS modules поддержка
    singleThread: true,           // ← Один поток для стабильности
    env: {
      VITE_LOG_LEVEL: 'verbose',
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/types/**',
      ],
    },
  },
})
```

**Назначение:**
- **Отдельный конфиг для тестов** (переопределяет vite.config.ts для vitest)
- **Покрытие кода** (v8, html/json/lcov отчёты)
- **CSS modules** поддержка в тестах
- **Single thread** для стабильности на CI/CD

---

### Как используются в Docker сборке?

#### client/Dockerfile

```dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .  # ← Копирует ВСЕ файлы включая vite.config.ts и vitest.config.ts

ENV VITE_API_URL=/api
ENV VITE_LOG_LEVEL=debug
ENV VITE_SEND_LOGS_TO_BACKEND=true
ENV VITE_APP_VERSION=2.1.2

RUN npm run build  # ← Использует vite.config.ts для сборки

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Вывод:**
- ✅ **vite.config.ts** — копируется и используется при сборке
- ✅ **vitest.config.ts** — копируется, но НЕ используется в production
- ✅ **Тесты** — запускаются только локально/CI, не в Docker

---

### Откуда берутся конфиги?

| Файл | Авторский код (upstream/main) | dp-custom |
|------|-------------------------------|-----------|
| `vite.config.ts` | ✅ Базовый (без server/test) | ✅ Расширенный (proxy + test) |
| `vitest.config.ts` | ❌ Отсутствует | ✅ Новый файл |
| `vite.config.ts` в Docker | ✅ Копируется при сборке | ✅ Копируется при сборке |

**Механизм:**
1. Конфиги **хранятся в репозитории** (git)
2. При сборке Docker **копируются** в образ (COPY . .)
3. При обновлении через update.sh — **скачиваются новые образы** (GHCR)
4. При обновлении через update-custom.sh — **собираются из исходников** (git clone + build)

---

### Требуется ли перенос в upstream?

#### vite.config.ts
**Статус:** ⚠️ Требуется перенос

**Причина:**
- Без proxy `/bus` → локальная разработка не работает
- Без proxy `/api` → frontend не подключается к backend
- Порт 8080 → стандарт для разработки (3000 заблокирован Hyper-V)

**Что перенести:**
```typescript
server: {
  port: 8080,
  proxy: {
    '/api': { target: 'http://localhost:3100', changeOrigin: true },
    '/bus': { target: 'http://localhost:3100', changeOrigin: true }
  }
},
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './test/setup.ts',
  pool: 'forks',
  poolOptions: {
    forks: {
      maxForks: 4,
      minForks: 1,
    },
  },
}
```

---

#### vitest.config.ts
**Статус:** ✅ Рекомендуется перенос

**Причина:**
- Отдельный конфиг для тестов (best practice)
- Покрытие кода (v8) для отчётности
- Single thread для стабильности
- CSS modules поддержка

**Что перенести:**
- Весь файл целиком

---

## 📝 ИТОГОВЫЙ ЧЕК-ЛИСТ для переноса в upstream

### ✅ Выполнено (dp-custom)

- [x] client/nginx.conf — `/bus/` location
- [x] install.sh — `/bus/` в SSL и HTTP секциях
- [x] install.sh — proxy timeouts в `/api/`
- [x] update.sh — `check_and_fix_credentials()`
- [x] update.sh — `check_containers_running()`
- [x] update.sh — `resolve_compose_cmd()`
- [x] update.sh — `ensure_bus_location()` ✅
- [x] update.sh — `ensure_nginx_api_timeouts()` ✅
- [x] update.sh — вызов функций + `restart frontend` ✅
- [x] docker-compose.yml — переменные без дефолтов
- [x] docker-compose.yml — `PORT` и `LOG_LEVEL` в backend

### ⚠️ Требуется добавить

- [ ] **docker-compose.yml** — добавить `env_file: .env` для всех сервисов
- [ ] **docker-compose.yml** — добавить VITE_* переменные во frontend
- [ ] **docker-compose.yml** — закомментировать ports у postgres и backend (безопасность)
- [ ] **docker-compose.local.yml** — добавить healthcheck для postgres
- [ ] **client/vite.config.ts** — server.proxy и test конфиг
- [ ] **client/vitest.config.ts** — новый файл
- [ ] **install.sh** — убрать `"3000:3000"` из frontend ports (безопасность)
- [ ] **install.sh** — добавить `env_file` и VITE_* в docker-compose генерацию

### 📋 Файлы для коммита в upstream (dp-fix ветка)

```
client/nginx.conf              ← Изменён
client/vite.config.ts          ← Изменён (требуется)
client/vitest.config.ts        ← Новый (требуется)
install.sh                     ← Изменён
update.sh                      ← Изменён (ensure_* + restart)
docker-compose.yml             ← Изменён
```

---

## 🔧 Рекомендации по тестированию перед PR

### 1. Локальная проверка vite/vitest

```powershell
cd client
npm install
npm run dev      # Проверка proxy на localhost:8080
npm run test     # 329 тестов должны пройти
npm run lint     # 0 ошибок
```

### 2. Проверка update.sh на VPS

```bash
# На VPS
cd /opt/3dp-manager

# Резервная копия
cp client/nginx-client.conf client/nginx-client.conf.bak

# Запуск update.sh
bash update.sh

# Проверка
curl -I http://localhost:80/bus/test-uuid  # Должен быть 200 или 404 (не 404 от nginx)
docker compose logs frontend | grep "bus"  # Проверка логов
```

### 3. Проверка install.sh (чистая установка)

```bash
# На чистом VPS
bash <(curl -fsSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/install.sh)

# Проверка
curl -I https://your-domain.com/bus/test-uuid  # 200 или 404
curl -I https://your-domain.com/api/health    # 200
```

---

**Документ обновлён:** 2 апреля 2026 г.  
**Аудит провёл:** Qwen Code  
**Версия 3dp-manager:** 2.1.2
