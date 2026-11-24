# SIDEQUEST: медиа кейса

Сейчас в кейсе стоят схемы концепта, а не скриншоты. Источники — SVG рядом с WebP
в `public/home/cases/sidequest/`. Генератор: `node scripts/generate-sidequest-media.mjs`.

Обложка каталога: `cover-card.webp` (1200×1500). Первый экран кейса: `scene.webp` (1920×1080).

Остальные файлы: `route` — поиск пути, `buttons` — захват и нажатие,
`radio` — включение музыки, `book` — перелистывание, `fall` — падение,
`applications` — возможное применение. Изображения можно заменить своими,
сохранив имена и размеры, или обновить пути/размеры в `app/data/projectCaseDetails.json`.

Чтобы вместо схемы поставить короткий ролик, у соответствующего элемента media
указать `type: "video"`, `src: "/home/cases/sidequest/имя.mp4"` и `poster`.
Компоненты кейса уже поддерживают видео. Alt-подписи находятся в
`content/locales/ru.json` и `en.json`, в `projects.details.sidequest`.

Интерактив доступен на `/ru/projects/sidequest/interactive` и `/en/projects/sidequest/interactive`.
Его файлы изолированы в `public/experiments/sidequest`. После обновления отдельного
проекта `E:\GitHub\sidequest` выполнить `node scripts/sync-sidequest.mjs` из корня KADO.
Тесты и исходный OGG в публичную копию не входят; MP3, лицензия и шрифт входят.
