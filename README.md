# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Загрузка статической сборки по FTP

Запустить `npm run build`. Готовый сайт находится в `.output/public`.
В Total Commander открыть эту папку слева, а справа — FTP-каталог сайта
(обычно `public_html`, `www` или `htdocs`, точное имя зависит от хостинга).
Скопировать всё содержимое `.output/public` с сохранением структуры папок.
`index.html` должен лежать прямо в корне сайта, рядом с `_nuxt`, `projects`
и остальными папками. Сборка рассчитана на корень домена, а не на подпапку.
При обновлении сначала загрузить папки с ресурсами, затем HTML-файлы.
Исходники, `node_modules`, `.env` и папку `.output/server` загружать не нужно.

Во всех HTML включён `noindex, nofollow`, включая служебные страницы 200/404.
`robots.txt` разрешает обход, чтобы поисковики могли прочитать `noindex`.
Это соответствует [инструкции Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Отправка формы требует отдельного Node.js-обработчика и SMTP; FTP-копирование
статических файлов само по себе отправку не подключает. См. `contact-api/README.md`.
Для записи голоса сайт должен открываться по HTTPS.

## Contact form and voice messages

The static site supports up to two voice messages (90 seconds in total), playback, replacement and microphone level checks. Messages are sent in recording order. Sending uses a separate SMTP gateway; see [contact-api/README.md](contact-api/README.md) and [.env.example](.env.example) for configuration and deployment. SMTP credentials are server-only. Run `npm run contact:test` for focused tests (FFmpeg/ffprobe required).

To test recording offline on the development computer, run `npm run dev` and open `http://localhost:3000` (or the port printed by Nuxt) in a browser with microphone permission. Recording and playback work without an internet connection; sending email requires a working gateway and SMTP connection. A plain HTTP LAN IP is not a secure context. Offline phone testing requires local HTTPS with a certificate trusted by the phone; an HTTPS tunnel is an online alternative. Select a microphone below the project description, click the microphone icon to record, then stop and play. Valid recordings are saved automatically and included with the application; no separate confirmation is needed. Re-recording replaces a message in its original position after a valid recording finishes. Cancelling or failing a replacement preserves the original. Text and voice messages remain available together. Recordings are only kept in the current browser session; reloading the page clears them.
