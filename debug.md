# Локальная отладка 3dp-manager

## Порты локального стенда
- frontend: `http://localhost:8080`
- backend API: `http://localhost:3100/api`
- postgres: `localhost:15432`

## Запуск/перезапуск
```powershell
# полный запуск
docker compose -f docker-compose.local.yml up -d --build

# частичный перезапуск только фронта
docker compose -f docker-compose.local.yml up -d --build --no-deps frontend

# частичный перезапуск только бэка
docker compose -f docker-compose.local.yml up -d --build --no-deps server

# статус контейнеров
docker compose -f docker-compose.local.yml ps
```

## Что уже встроено
- Backend scanner (RealiTLScanner) собирается в `server/Dockerfile` и кладется в контейнер backend.
- Блок `Автопоиск SNI (backend scanner)` показывается только если бинарник сканера доступен в контейнере.
- Во время сканирования UI получает статус с backend (`/api/domains/scan/status`) и показывает реальный countdown.
- Если обновить страницу во время скана, UI подхватывает активный запуск по backend-статусу и продолжает отсчет.
- После завершения скана результат можно получить из backend (`/api/domains/scan/last-result`) даже если исходный запрос был прерван (например, после F5).
- Предварительный список сканера:
  - ручная проверка ссылками,
  - удаление позиций,
  - очистка,
  - экспорт в `.txt`,
  - сохранение состояния после F5.
- Основной список:
  - ссылки на домены,
  - hover-подсветка строк,
  - экспорт полного списка в `.txt`.

## Нормализация доменов (импорт и ручное добавление)
- Единые правила применяются и для загрузки файла, и для добавления по одному.
- `*.domain.com` нормализуется в `domain.com`.
- Комментарии и мусор отбрасываются (`#`, `;`, `//`, URL/пути/порты и т.п.).
- Дубликаты убираются без учета регистра.
- Явно некорректные значения отклоняются.

## Тестовый "больной" список
- Файл для проверки импорта: `checker/domains-import-fuzz.txt`

## Быстрые проверки
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080
Invoke-WebRequest -UseBasicParsing http://localhost:3100/api
```

## Остановка
```powershell
docker compose -f docker-compose.local.yml down
```

## Перед PR
```powershell
git status --short
git diff --name-only
```

Проверяем, что в PR идут только целевые изменения фичи.

## Обновление production (кастомная ветка)
Для сервера, где `bash <(curl ...)` не работает из-за `/dev/fd`, используем пайп:

```bash
curl -fsSL https://raw.githubusercontent.com/iqubik/3dp-manager/dp-fix/update-custom.sh | bash -s -- -r https://github.com/iqubik/3dp-manager.git -b dp-fix
```

Что делает команда:
- подтягивает исходники из `iqubik/3dp-manager` ветки `dp-fix` в `/opt/3dp-manager-src`,
- собирает `backend/frontend` из этих исходников,
- поднимает контейнеры через `docker-compose.custom.yml` поверх текущей установки в `/opt/3dp-manager`.

Проверка после обновления:

```bash
cd /opt/3dp-manager
docker compose -f docker-compose.yml -f docker-compose.custom.yml ps
docker compose -f docker-compose.yml -f docker-compose.custom.yml logs --tail 120 backend
docker compose -f docker-compose.yml -f docker-compose.custom.yml logs --tail 120 frontend
```

Ожидаемо и нормально в логах frontend:
- `can not modify /etc/nginx/conf.d/default.conf (read-only file system?)`

Это штатно при `:ro`-монтировании nginx-конфига.
