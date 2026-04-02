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
