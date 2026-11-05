# HJ Track

Внутренняя платформа сети фитнес-клубов Hero's Journey: заявки и чек-листы смен, график и обмен сменами, чекин по IP, находки, мерч и склад, отзывы (2ГИС и QR), новости, гайдбук, адаптация стажёров, аптечка, ремонт тренажёров, ИИ-помощник, видеозвонки, 3D-модели инженерных систем клубов. Пользователи: шеф, менеджеры клубов, админы, РОП и МОП, маркетинг, техники, стажёры.

Прод: `https://ticket-tracker-inky.vercel.app` (Vercel-проект `ticket-tracker`, алиас `track.hj.fit` пока без DNS-записи).

Связанные документы:
- [docs/MIGRATION.md](docs/MIGRATION.md) — паспорт системы для переноса на другие серверы: функции, Firebase, интеграции, секреты, передача доступов.
- [docs/merch-sync-api.md](docs/merch-sync-api.md) — API выгрузки мерча для платформы маркетинга.
- [tools/plan/README.md](tools/plan/README.md) — 3D-модели клубов из CAD-чертежей (Python).
- [tools/lidar/README.md](tools/lidar/README.md) — LiDAR-сканы в 3D (Python).
- [dwh-sync/README.md](dwh-sync/README.md) — синхронизация с аналитическим хранилищем.

---

## 1. Быстрый старт

```
git clone https://github.com/Hero-s-Journey/hjtrack.git
cd hjtrack
npm ci
npm run dev          # http://localhost:5173
npm run build        # dist/
npm run lint
```

Требования: Node 20+ (разработка ведётся на 24), npm. Фронтенд работает сразу: публичный конфиг Firebase зашит в `src/lib/firebase.js`, вход по email и паролю Firebase Auth. Серверные функции (`api/`) локально не запускаются без `vercel dev` и переменных окружения из раздела 6.

Аккаунт для входа: email из белого списка `src/lib/userRoles.js` или из коллекции `app_users`. При первом входе система предлагает придумать пароль.

---

## 2. Стек и состав

| Слой | Технология | Где |
|---|---|---|
| UI | React 19, React Router 7, Tailwind 3, lucide-react, sonner | `src/` |
| Сборка | Vite 8, плагин `emit-version` пишет `version.json` | `vite.config.js` |
| Данные, realtime | Firebase Firestore (JS SDK 12, дисковый кеш) | `src/lib/firebase.js` |
| Аутентификация | Firebase Auth: email + пароль, анонимный вход для гостей | `src/store/TicketContext.jsx`, `src/pages/Login.jsx` |
| Push | Firebase Cloud Messaging, service worker `public/sw.js` | `src/lib/push.js`, `api/send-push.js` |
| Сервер | 12 serverless-функций на Vercel, firebase-admin | `api/` |
| ИИ | Vertex AI Gemini по сервисному аккаунту | `src/lib/vertex.js`, `api/assistant.js` |
| Видеозвонки | Agora RTC | `src/store/CallContext.jsx` |
| 3D | Three.js со CDN, статичные страницы | `public/models/<club>/` |
| Фоновые процессы | Node-скрипты на отдельной машине | `wa-bridge/`, `2gis-bridge/`, `dwh-sync/`, `mcp-hjtrack/` |
| Генерация геометрии | Python 3.12 | `tools/plan/`, `tools/lidar/` |

---

## 3. Архитектура фронтенда

### 3.1. Дерево папок

```
src/
  main.jsx, App.jsx        точка входа, роуты, обёртки доступа
  pages/                   40 страниц, одна страница = одна вкладка
  components/              layout/ (Header, Sidebar, колокольчик, звонки), tickets/, checklists/, schedule/, merch/, news/
  store/                   React-контексты с данными (см. 3.3)
  lib/                     доступ (userRoles, navAccess, access), firebase, push, перевод, интеграции
  data/                    статичные справочники: чек-листы смен, чек-лист стажёра, реестр 3D-моделей
  locales/                 kk.json, en.json (русский — язык кода)
  utils/formatters.js
public/
  sw.js, manifest.webmanifest, icons/     PWA и пуши
  models/<slug>/           3D-модели клубов (index.html + club-geom.json + подложки)
api/                       серверные функции Vercel; api/_lib — общий код, не функции
tools/                     Python-инструменты (раздел 9)
```

### 3.2. Роуты и доступ

`App.jsx` объявляет роуты и оборачивает каждый в проверку `allowedRoles`. Роли: `chef` (шеф, видит всё), `manager` (менеджер клуба), `admin` (администратор клуба), `rop` (руководитель отдела продаж, с флагом `mop` для менеджеров продаж), `komdir`, `marketing`, `tech`, `viewer`, `lostviewer`, `guest` (стажёр).

Доступ определяется в трёх местах, и новая вкладка требует правки всех трёх:
1. `App.jsx` — роут и `allowedRoles`.
2. `src/lib/navAccess.js` — `NAV_ITEMS` (пункт меню) и `navAllowed` (правила по ролям, с учётом `tabsExtra`/`tabsHidden` из `app_users`).
3. `src/lib/assistantKnowledge.js` — описание вкладки для ИИ-помощника.

Кто есть кто: белый список `src/lib/userRoles.js` (email → роль, клуб, список клубов для мультиклубных менеджеров) плюс коллекция `app_users` (аккаунты, созданные из интерфейса, переопределения ролей, отключённые аккаунты `revoked`, телефоны для Академии). Панель «Сотрудники и доступы» в Настройках доступна только шефу.

Клубы захардкожены примерно в 20 файлах (константы `CLUBS`, цвета, бейджи, смены по клубам в `SchedulePage.jsx` и `ShiftSwap.jsx`). Добавление клуба = правка всех этих мест плюс `userRoles.js`.

### 3.3. Состояние и данные

Данные живут в контекстах `src/store/`, каждый подписывается на Firestore через `onSnapshot` и раздаёт данные страницам:

| Контекст | Отвечает за |
|---|---|
| `TicketContext` | пользователь, вход и выход, роли, заявки, вложения (base64), активация отложенных заявок |
| `ScheduleContext` | график смен по месяцам, сотрудники (`employees`), расчёт часов и зарплат |
| `ChecklistContext` | чек-листы смен (`checklists`, справочник в `src/data/checklistData.js`) |
| `NotificationContext` | колокольчик, опрос `scheduled_calls`, вотчер новых отзывов |
| `CallContext` | видеозвонки Agora, комнаты `call_rooms` |

Остальные страницы подписываются на свои коллекции сами. Всего 89 вызовов `onSnapshot` в 35 файлах: интерфейс realtime, polling нигде не используется.

Правила работы с Firestore, выученные на инцидентах:
- Firebase Storage не включён. Любые файлы хранятся base64 в документах, лимит документа 1 МБ. Фото сжимаются на клиенте (`browser-image-compression`), в списке лежит миниатюра, полное фото отдельным документом (`lost_items` + `lost_item_photos`).
- Записи при исчерпанной квоте не падают, а виснут: SDK ретраит бесконечно. Диагностика в `docs/MIGRATION.md`, раздел 4.
- Формы с сохранением по blur пишут только изменённые поля поверх свежего документа, а не весь снимок из памяти вкладки (урок полотенец).
- Сроки хранения: новости 45 дней, график фоном 2 месяца, возвращённые находки 31 день, фото касс по `expiresAt` (крон), счета 31 день (чистка при открытии страницы).

### 3.4. Push-уведомления

`src/lib/push.js` регистрирует токен устройства (`push_tokens`), `src/lib/pushNotify.js` подбирает получателей на клиенте (роли, клуб, исключение автора, личные фильтры `push_prefs`) и вызывает `api/send-push.js`. Сервер дополнительно режет: РОП получает только Demo Day, лиды и передачу смены; пуши про WhatsApp заглушены. Плановые напоминания делает `api/scheduled-reminders.js`, его зовут облачные рутины.

### 3.5. Локализация

Русский — родной язык кода и интерфейса. Казахский и английский делаются живым переводом DOM (`src/lib/liveTranslate.js`) по словарям `src/locales/kk.json` и `en.json`. При `lang='ru'` движок выключен. Новая строка интерфейса = новая пара в обоих словарях; у QR-формы отзывов своя система переводов.

### 3.6. PWA и обновления

`public/sw.js` даёт установку на телефон и фоновые пуши; офлайн-кеша нет намеренно. Сборка кладёт `version.json`, клиент сверяет его с собственной меткой и перезагружается при новой версии; метка видна в Настройках как «Сборка» — с неё начинается диагноз «фича не появилась».

### 3.7. 3D-модели клубов

Страница `/club-model` показывает вкладки по клубам из реестра `src/data/clubModels.js` и грузит статичный `public/models/<slug>/index.html` в iframe. Шеф видит все клубы, сотрудник только свой и только если модель `ready`. Сами модели генерируются Python-инструментами (раздел 9).

---

## 4. Серверная часть (`api/`)

Каждый файл в `api/` — отдельная функция Vercel с сигнатурой `(req, res)`. Общий код лежит в `api/_lib/` и `src/lib/` (например `vertex.js` и `userRoles.js` читаются и сервером). Лимит бесплатного тарифа Vercel 12 функций исчерпан: тринадцатый файл молча ломает деплой целиком.

| Функция | Назначение |
|---|---|
| `assistant` | ИИ-помощник, классификация лидов, редактор новостей, прокси 2ГИС |
| `send-push`, `scheduled-reminders` | рассылка и плановые напоминания |
| `checkin` | чекин по внешнему IP (`checkin_config/ip_map`) |
| `slack-notify` | шлюз в Slack |
| `academy-token` | SSO в партнёрскую Академию |
| `merch-sync` | выгрузка мерча для маркетинга (`x-api-key`) |
| `news-rewrite`, `release-note` | новости из релизов |
| `create-user`, `token` | служебные, по секрету |
| `cleanup-checkout-photos` | крон `0 3 * * *` UTC |

Полная таблица с вызывающими сторонами и переменными окружения в `docs/MIGRATION.md`, раздел 3.

### 4.1. Vertex AI Gemini по сервисному аккаунту

Все «умные» функции платформы (помощник по гайдбуку, разбор заявки, классификация лидов из WhatsApp, перевод новостей, «Сделать понятно» для релизов) ходят в Gemini не через публичный ключ Google AI Studio, а через Vertex AI в проекте Google Cloud `hjtrack-928f5`. Клиент — `src/lib/vertex.js` (копия логики в `src/lib/newsRewrite.js`), без SDK, чистый `fetch`.

Как работает запрос:
1. `vertexToken()` собирает JWT: заголовок `RS256`, тело `{iss: FIREBASE_CLIENT_EMAIL, scope: cloud-platform, aud: oauth2.googleapis.com/token, iat, exp: +1 ч}` и подписывает его приватным ключом из `FIREBASE_PRIVATE_KEY` (стандартный `crypto.createSign('RSA-SHA256')`).
2. JWT обменивается на access token в `https://oauth2.googleapis.com/token` (grant `jwt-bearer`). Токен кешируется в памяти функции до истечения минус минута; на Vercel это значит «на время жизни тёплого инстанса».
3. `vertexGenerate()` вызывает REST `POST https://aiplatform.googleapis.com/v1/projects/hjtrack-928f5/locations/global/publishers/google/models/<model>:generateContent` с заголовком `Authorization: Bearer <token>`. Тело: `systemInstruction`, `contents` (история диалога в ролях user/model), `generationConfig` (temperature, maxOutputTokens, `responseMimeType: application/json` для структурированных ответов, `thinkingConfig.thinkingBudget` для «размышлений» модели).
4. Один повтор при 429/503 с паузой 1.2 с. При `json: true` ответ парсится, при обрезанном JSON вырезается первая пара `{…}`.

Модель по умолчанию `gemini-2.5-flash`, регион `global`. Переопределение для лидов — `GEMINI_LEAD_MODEL`.

Что это даёт и чего требует:
- Биллинг идёт на проект `hjtrack-928f5` (тот же, что Firestore), отдельный ключ Gemini не нужен, ключ не попадает в бандл и не светится в URL.
- Сервисному аккаунту нужна роль `Vertex AI User` (`roles/aiplatform.user`) и включённый API `aiplatform.googleapis.com` в проекте. Тот же ключ используется firebase-admin для Firestore и FCM, поэтому у него роли Editor-уровня; при переезде лучше завести отдельный аккаунт с узкими ролями (см. `docs/MIGRATION.md`, раздел 13).
- Лимиты: квоты Vertex по проекту (запросов в минуту на модель), при превышении 429 и один повтор. Стоимость по прайсу Vertex за токены ввода и вывода; «размышления» (`thinkingBudget`) тоже тарифицируются как вывод.
- Где Vertex НЕ используется: `api/release-note.js` работает по ключу `GEMINI_API_KEY` (Google AI Studio, эндпоинт `generativelanguage.googleapis.com`).
- Чтобы перейти на другой проект Google Cloud: сменить три переменные `FIREBASE_*` (или вынести Vertex на отдельные `VERTEX_*` в `vertex.js`), выдать роль, включить API. Чтобы уйти с Vertex на AI Studio: заменить URL и авторизацию в `vertexGenerate()` на `?key=`; формат тела `generateContent` у обоих API одинаковый.

Проверка работоспособности: открыть `/assistant`, задать вопрос по гайдбуку; в логах функции Vercel ошибка вида `vertex 403` означает отсутствие роли или выключенный API, `vertex token:` — сломанный приватный ключ (чаще всего потерянные `\n`).

---

## 5. Фоновые процессы вне Vercel

Работают на отдельной Windows-машине как постоянные Node-процессы с автоперезапуском (`start-bridge.bat`, `run-hidden.vbs`). Все ходят в Firestore клиентским SDK с анонимным входом.

| Папка | Что делает | Состояние, которое нельзя терять |
|---|---|---|
| `wa-bridge/` | WhatsApp клубов через Baileys: лента `wa_messages`, лиды через `/api/assistant` | `wa-bridge/auth/` (сессии) |
| `2gis-bridge/` | ответы на отзывы 2ГИС из очереди `review_replies` через кабинет (Playwright, только видимое окно), проверка новых отзывов каждые 3 ч | `2gis-bridge/profile/` |
| `dwh-sync/` | посещения атлетов каждые 5 мин и покрытие пульсометрами раз в 6 ч из Postgres DWH через VPN | `dwh-sync/config.json` |

---

## 6. Переменные окружения

Задаются в Vercel (Settings → Environment Variables), в репозитории их нет.

| Переменная | Для чего |
|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | сервисный ключ проекта `hjtrack-928f5`: Firestore, FCM, Vertex |
| `ACADEMY_PROJECT_ID`, `ACADEMY_CLIENT_EMAIL`, `ACADEMY_PRIVATE_KEY` | SSO в Академию |
| `SLACK_WEBHOOK_URL`, `SLACK_WEBHOOK_INSTUDIO` | Slack |
| `MERCH_API_KEY`, `TOKEN_SECRET`, `SYNC_SECRET`, `RELEASE_NOTE_SECRET` | ключи интеграций |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `ANTHROPIC_API_KEY` и прочие ИИ-ключи | опционально, Vertex работает без них |

`FIREBASE_PRIVATE_KEY` хранится с буквальными `\n`, код сам заменяет их на переводы строк.

---

## 7. Деплой

1. Пуш в `main` любого из двух remote: `origin` (`D1shon/ticket-tracker`, зеркало) и `hj` (`Hero-s-Journey/hjtrack`, основной). Принято пушить в оба.
2. Vercel-проект `ticket-tracker` собирает `main` автоматически. В аккаунте есть дубль `ticket-tracker-mjt9` без env и домена: его стоит удалить.
3. После пуша проверить выкладку: `curl https://ticket-tracker-inky.vercel.app/version.json` должен вернуть новую метку. Прод нельзя опрашивать циклом слишком часто (403 checkpoint).
4. Если деплой упал с «Error on Deploying outputs» — в `api/` появилась тринадцатая функция.

`vercel.json`: SPA-rewrite всех путей кроме `/api/*` на `index.html`; `/assets/*` кешируется на год, остальное `no-cache` (иначе клиенты видят «Не удалось открыть страницу» после деплоя); крон чистки фото касс.

Локальная проверка функций: `vercel dev` с переменными из раздела 6. Автотестов в репозитории нет (упоминание `tests/merch-sync.test.js` в `docs/merch-sync-api.md` относится к версии, которой здесь нет); проверка руками по чек-листу раздела 7.

---

## 8. Конвенции кода

- Комментарии и тексты интерфейса на русском; имена файлов и идентификаторы на английском.
- Один файл страницы на вкладку, стили inline или Tailwind, без CSS-модулей.
- Новая вкладка = роут + `navAccess.js` + `assistantKnowledge.js` (раздел 3.2), плюс пара строк в `kk.json`/`en.json`.
- Новые документы с файлами: base64 в документе, миниатюра в списке, полное фото отдельным документом.
- Серверный код не читает Firestore через firebase-admin там, где это можно сделать клиентским SDK (квоты), кроме записи пушей и чекинов.
- Коммиты: `feat(scope): …`, `fix: …`, `docs: …` с кратким «что и зачем».

---

## 9. Роль Python в проекте

Python не участвует в работе приложения: его нет ни на Vercel, ни в мостах, ни в сборке. Это инструменты разработчика для подготовки статичных данных, которые потом кладутся в `public/` и уезжают в репозиторий как готовые файлы. Если Python недоступен, приложение и деплой не страдают, нельзя только пересобрать 3D-геометрию и сканы.

### 9.1. `tools/plan/` — 3D-модели клубов из CAD-чертежей

Инженерные проекты клубов приходят векторными PDF (планы ВК, ОВ: отопление, вентиляция, кондиционирование). Конвейер превращает их в геометрию для Three.js-вьюера:

1. `dump.py <pdf> <страница> <out.json> [render.png]` — pdfminer вытаскивает все линии, заливки, кривые с цветом и толщиной и тексты с координатами.
2. `build_geom.py` (Colibri) и `build_geom_4you.py` (4YOU) — из этих json строят `club-geom.json` и подложки `plan-*.jpg`:
   - стены: растровая маска заливок и двойных линий, морфологическое закрытие, контуры `cv2.findContours`, полигоны с отверстиями;
   - воздуховоды: короба нарисованы контуром толстых линий, контуры замыкаются и заливаются `floodFill`, помещения внутри петель магистралей отбрасываются по ширине, незамкнутые узкие ответвления смыкаются по сдвоенным линиям;
   - трубы отопления и фреонопроводы: полилинии по цвету и толщине;
   - фанкойлы: координаты символов, прочитанные с чертежа, со справочником моделей;
   - подложка пола: растр листа с перекрашенными стенами.
3. Вьюер `public/models/<slug>/index.html` грузит `club-geom.json`; оборудование, зоны и сценарии («Жарко», «Душно», «Капает») описаны прямо в html и правятся руками.

Контроль качества: скрипты пишут `check-<уровень>.png` поверх исходного листа, по нему сверяют совпадение с чертежом. `patch*.py` — одноразовые патчи html, повторно не запускаются.

Библиотеки: pdfminer.six, numpy, scipy, OpenCV, Pillow.

### 9.2. `tools/lidar/` — LiDAR-сканы помещений

Записи iPhone-приложения DepthCapture (контейнер `.mcap`: глубина, цвет, IMU) превращаются в поверхность: `extract.py` разбирает контейнер, `register.py` сшивает кадры (IMU + ICP point-to-plane), `fuse.py` строит TSDF и mesh (`mesh.glb`). Результат смотрят через `viewer.html` в `public/scan-preview/`. Пока использовался для теста, настоящего скана теплового пункта ещё нет.

Библиотеки: numpy, scipy, scikit-image, OpenCV, Pillow.

### 9.3. Одноразовые скрипты

`trim_sales.py` в корне — разовая обрезка файла страницы, исторический артефакт. Такие скрипты можно удалять.

### 9.4. Ограничения среды

На машине разработчика включён Windows Smart App Control, который блокирует нативные DLL по репутации: работают numpy 1.26.4 (с шимом `tools/lidar/nprand_shim.py`), scipy 1.14.1, scikit-image 0.24, Pillow 10.4, OpenCV 4.10; не работают open3d, numpy 2 и `cryptography` (поэтому в `tools/plan/cryptography/` лежит пустая заглушка, и скрипты запускаются из папки `tools/plan`, чтобы она была первой в `sys.path`). На обычном Linux-сервере эти обходы не нужны: `pip install pdfminer.six numpy scipy opencv-python pillow scikit-image`.

### 9.5. Что нужно знать новому разработчику

- Пересборка модели: `cd tools/plan && python dump.py … && python build_geom_4you.py <папка с pN.json> ../../public/models/4you`, затем проверить `check-*.png` и закоммитить `club-geom.json` и `plan-*.jpg`.
- Система координат моделей: X вдоль осей здания, Z поперёк, Y вверх; привязки по листам и масштабы описаны в `tools/plan/README.md`.
- Фото оборудования и видео инженерных помещений — лучший источник для уточнения расстановки: по ним заполнялись карточки теплового пункта Colibri.
