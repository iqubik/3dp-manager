# 3DP-MANAGER — Контекст для Qwen Code

## Обзор проекта

**3DP-MANAGER** — утилита для автогенерации инбаундов к панели **3x-ui** (v2.8.4+), формирования единой подписки и настройки перенаправления трафика с промежуточного сервера на основной.

### Основные возможности
- Генерация 10 разнообразных подключений (vless, vmess, shadowsocks, hysteria2, trojan)
- Порты: 443, 8443 (фиксированные) + случайные из диапазона 10000-60000
- Транспорт: tcp, websocket, grpc, xhttp
- SNI из whitelist доменов (пользовательский или встроенный)
- Единая подписка со статичным URL
- Графический интерфейс (с версии 2.0.0)
- Каскадная схема с перенаправлением трафика
- Backend SNI scanner (RealiTLScanner)

### Технологии
| Компонент | Стек |
|-----------|------|
| **Backend** | NestJS (TypeScript), PostgreSQL, TypeORM, JWT, SSH2 |
| **Frontend** | React 19, TypeScript, Material UI, Vite |
| **Infra** | Docker, Docker Compose, Nginx |
| **Scanner** | Go (RealiTLScanner, multi-stage build) |
| **OS** | Ubuntu 20.04+, Debian 12.11+ |

### Архитектура
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend    │────▶│  PostgreSQL │
│  (React)    │     │  (NestJS)    │     │   (18-alpine)│
│  Port 80    │     │   Port 3100  │     │   Port 5432 │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  3x-ui Panel │
                    │   (API)      │
                    └──────────────┘
```

---

## Структура проекта

```
3dp-manager/
├── server/              # Backend (NestJS)
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── auth/        # Аутентификация (JWT)
│   │   ├── inbound/     # Генерация инбаундов
│   │   ├── domain/      # Управление доменами
│   │   ├── scanner/     # SNI scanner (RealiTLScanner)
│   │   └── ...
│   ├── test/
│   ├── Dockerfile       # Multi-stage: Node.js + Go scanner
│   ├── package.json
│   └── .env.example
├── client/              # Frontend (React + Vite)
│   ├── src/
│   ├── public/
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── checker/             # Скрипты проверки (git-ignored)
├── docker-compose.yml   # Оркестрация контейнеров
├── install.sh           # Скрипт установки
├── update.sh            # Скрипт обновления
├── delete.sh            # Скрипт удаления
├── forwarding_install.sh # Установка перенаправления
├── forwarding_delete.sh  # Удаление перенаправления
├── get_domains.js       # Утилита извлечения доменов
├── whitelist.txt        # Список доменов по умолчанию
└── README.md            # Основная документация
```

---

## Сборка и запуск

### Production установка
```bash
# Установка 3x-ui панели
bash <(curl -Ls https://raw.githubusercontent.com/MHSanaei/3x-ui/master/install.sh)

# Установка 3dp-manager
bash <(curl -fsSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/install.sh)
```

### Обновление
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/update.sh)
```

### Удаление
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/delete.sh)
```

### Локальная разработка (Windows/PowerShell)

#### Backend (server/)
```powershell
cd server
npm install
npm run build        # Сборка
npm run start:dev    # Dev-режим с watch
npm run start:prod   # Production
npm run lint         # ESLint
npm run test         # Jest тесты
npm run test:e2e     # E2E тесты
```

#### Frontend (client/)
```powershell
cd client
npm install
npm run dev          # Vite dev server
npm run build        # Сборка в dist/
npm run lint         # ESLint
npm run preview      # Preview production сборки
```

#### Docker Compose (локальный стенд)
```powershell
# Полный запуск
docker compose -f docker-compose.local.yml up -d --build

# Частичный перезапуск только фронта
docker compose -f docker-compose.local.yml up -d --build --no-deps frontend

# Частичный перезапуск только бэка
docker compose -f docker-compose.local.yml up -d --build --no-deps server

# Статус контейнеров
docker compose -f docker-compose.local.yml ps

# Остановка
docker compose -f docker-compose.local.yml down
```

**Порты локального стенда:**
- frontend: `http://localhost:8080`
- backend API: `http://localhost:3100/api`
- postgres: `localhost:15432`

---

## Переменные окружения

### Backend (.env)
```bash
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=<secret>
DB_NAME=3dp_manager
JWT_SECRET=<secret>
ADMIN_LOGIN=admin
ADMIN_PASSWORD=<secret>
PORT=3100
```

### Docker Compose
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `JWT_SECRET`
- `ADMIN_LOGIN` / `ADMIN_PASSWORD`

---

## API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Аутентификация |
| GET | `/api/domains/scan/status` | Статус сканера доменов |
| GET | `/api/domains/scan/last-result` | Последний результат сканирования |
| POST | `/api/inbounds/generate` | Генерация инбаундов |
| GET | `/api/inbounds/list` | Список инбаундов |

---

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `docker-compose.yml` | Оркестрация: postgres, backend, frontend |
| `docker-compose.local.yml` | Локальная разработка (альтернативные порты) |
| `install.sh` | Полная установка с SSL, Hysteria2, firewall |
| `update-custom.sh` | Обновление из кастомной ветки |
| `server/src/app.module.ts` | Главный модуль NestJS |
| `server/Dockerfile` | Multi-stage сборка с RealiTLScanner (Go) |
| `client/nginx.conf` | Nginx конфигурация для frontend |
| `get_domains.js` | Node.js утилита извлечения доменов из подписок |
| `whitelist.txt` | Список доменов для генерации SNI |
| `debug.md` | Инструкция по локальной отладке |
| `audit.md` | Аудит кода PR (scanner + UI интеграция) |

---

## Разработка

### Вклад в проект
1. Форк репозитория
2. Ветка: `feature/<name>` или `fix/<name>`
3. Коммиты с описанием
4. Pull Request

### Git workflow (custom-ветки)
```bash
# Работа в dp-custom
git checkout dp-custom
# ... правки ...
git add .
git commit -m "feat: ..."
git push origin dp-custom

# Перенос коммитов в dp-fix для PR
git log --oneline dp-fix..dp-custom
git checkout dp-fix
git cherry-pick <commit_sha>
git push origin dp-fix
```

### Тестирование
- Backend: `npm run test` (Jest)
- E2E: `npm run test:e2e`
- Frontend: визуальное тестирование + ESLint

### Линтинг
```powershell
# Backend
cd server && npm run lint

# Frontend
cd client && npm run lint
```

### Быстрые проверки (PowerShell)
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080
Invoke-WebRequest -UseBasicParsing http://localhost:3100/api
```

---

## Безопасность

| Вектор | Статус | Меры |
|--------|--------|------|
| Command execution | ✅ | `spawn` без shell + валидация addr |
| SQL injection | ✅ | ORM/параметризация TypeORM |
| XSS | ✅ | React рендеринг |
| DoS по скану | ✅ | Ограничение одного активного скана |
| Long request timeout | ✅ | Nginx timeout'ы увеличены |

---

## Замечания

- **Hysteria 2**: Устанавливается автоматически при установке, порт 10000-20000
- **SSL**: Автоматическое обнаружение Let's Encrypt в `/etc/letsencrypt/live/<domain>/`
- **Swap**: Создаётся 2GB при RAM < 2000MB и отсутствии swap
- **Firewall**: UFW правила добавляются автоматически (443, 8443, 10000-60000 TCP/UDP)
- **Docker Compose**: Поддержка v2 (`docker compose`) и v1 (`docker-compose`)
- **Scanner**: RealiTLScanner собирается в multi-stage Dockerfile, доступен в контейнере backend
- **Нормализация доменов**: `*.domain.com` → `domain.com`, дубликаты удаляются, комментарии отбрасываются

---

## Полезные команды

```powershell
# Production (Linux)
# Посмотреть логин/пароль
grep -E "ADMIN_LOGIN|ADMIN_PASSWORD" /opt/3dp-manager/docker-compose.yml

# Логи контейнеров
docker compose logs -f backend
docker compose logs -f frontend

# Перезапуск сервиса
docker compose restart backend

# Очистка кэша
docker image prune -f

# Custom-обновление с GitHub
curl -fsSL https://raw.githubusercontent.com/iqubik/3dp-manager/dp-custom/update-custom.sh | bash -s -- -r https://github.com/iqubik/3dp-manager.git -b dp-custom
```

---

## Контакты

- Telegram: [@denpiligrim_web](https://t.me/denpiligrim_web)
- YouTube: [DenPiligrim](https://www.youtube.com/@denpiligrim)
- Issues: GitHub репозиторий

## Qwen Added Memories
- Правило: никогда не поддакивать пользователю без фактической проверки. Всегда проверять через команды перед выводами.
- Проверка процессов node на Windows: Get-CimInstance Win32_Process -Filter "ProcessId = PID" | Select CommandLine, ParentProcessId — показывает точный путь и родителя.
- Правила работы с тестами фронтенда: 0) Перед написанием теста изучи существующие рабочие образцы похожих тестов. 1) Пиши тесты от простого к сложному. 2) Файл теста не более 500 строк — иначе сложно поддерживать. 3) Не переходи к следующему тесту, пока не проверил новый тестовый набор индивидуально и в составе всех тестов. 4) После того как тест заработал, убери "шум" в выводе (подавление консоли через setup.ts фильтрацию логов).
