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

Production-сборка разрешает индексацию страниц. Для тестового хостинга установите
`NUXT_PUBLIC_SITE_INDEXABLE=false` **до сборки**: HTML получит `noindex`, sitemap
будет пустым. Обход разрешён, чтобы поисковики могли прочитать запрет индексации.
В режиме разработки индексация по умолчанию запрещена. Служебные `200.html` и `404.html` всегда
получают `noindex`. Переключение настройки требует новой сборки и загрузки файлов.

## SEO

Метаданные всех страниц находятся в `content/locales/ru.json`, раздел `seo`.
`app/composables/useSiteSeo.ts` формирует title, description, canonical, Open Graph,
Twitter Cards и JSON-LD; данные обновляются при SPA-переходах, включая возврат на
главную из KeepAlive. Основной адрес — `https://kadonext.com`, без `www` и завершающего
слеша у внутренних страниц. Услуги, автор и контакт — секции главной, поэтому
отдельных URL и hreflang для них нет. Сейчас опубликована только русская версия.

`/robots.txt` и `/sitemap.xml` генерируются при пререндеринге. Sitemap содержит
8 страниц и изображения кейсов. В нём нет фиктивных дат обновления и URL с якорями.
JSON-LD описывает студию, сайт, услуги, каталог, кейсы и цепочки навигации; данные
о рейтингах, ценах и адресе не добавляются без подтверждённого содержания страницы.

`npm run seo:images` создаёт превью 1200×630 из локальных материалов и логотипа.
Главная использует изображение клавиши с белой ō из `content/og/home-keycap.png`;
английский текст и логотип используются в графике OG. Метаданные страниц остаются русскими.
Стандартная иконка Nuxt заменена знаком KADO: ICO 16/32/48/96, PNG 96 и Apple Touch Icon 180.
`npm run seo:check` проверяет готовые HTML, уникальность метаданных, canonical,
JSON-LD, alt, размеры и наличие изображений, внутренние ссылки, sitemap и fallback.
Обе команды входят в `npm run build` и `npm run generate`.
У декоративных изображений и повторяющих подписи миниатюр `alt=""` намеренный.
`npm run seo:test` проверяет реактивные переходы, очистку canonical и JSON-LD
для неизвестных URL, переключение индексации и безопасную сериализацию разметки.
Без JavaScript прелоадер скрывается, а заголовок, метаданные и обложка кейса остаются видимыми.

После загрузки на хостинг настройте постоянные редиректы HTTP → HTTPS,
www → kadonext.com и внутренних URL со слешем → URL без слеша. Неизвестные URL
должны возвращать HTTP 404, а не главную со статусом 200. Эти правила зависят от
хостинга; Nuxt routeRules не настраивают FTP-сервер автоматически. Добавьте sitemap
в Google Search Console и Яндекс Вебмастер. Проверьте, что хостинг не добавляет
`X-Robots-Tag: noindex`, и проверьте опубликованные URL через инструменты этих систем.
Проверка статических файлов не заменяет проверку HTTP-ответов опубликованного сайта.

Отправка формы требует отдельного Node.js-обработчика и настроенного канала
Telegram или SMTP; FTP-копирование статических файлов само по себе отправку не
подключает. См. `contact-api/README.md`.
Для записи голоса сайт должен открываться по HTTPS.

## Contact form and voice messages

The static site supports up to two voice messages (90 seconds in total), playback, replacement and microphone level checks. Messages are sent in recording order. Production delivery can use a private Telegram bot chat or the SMTP fallback; see [contact-api/README.md](contact-api/README.md) and [.env.example](.env.example). Delivery credentials are server-only. Run `npm run contact:test` for focused tests (FFmpeg/ffprobe required).

To test recording offline on the development computer, run `npm run dev` and open `http://localhost:3000` (or the port printed by Nuxt) in a browser with microphone permission. Recording and playback work without an internet connection; production delivery requires a configured Telegram bot or SMTP gateway. A plain HTTP LAN IP is not a secure context. Offline phone testing requires local HTTPS with a certificate trusted by the phone; an HTTPS tunnel is an online alternative. Select a microphone below the project description, click the microphone icon to record, then stop and play. Valid recordings are saved automatically and included with the application; no separate confirmation is needed. Re-recording replaces a message in its original position after a valid recording finishes. Cancelling or failing a replacement preserves the original. Text and voice messages remain available together. Recordings are only kept in the current browser session; reloading the page clears them.

For a local UI-only submission preview, set `CONTACT_DEV_MOCK=success` in `.env` and restart `npm run dev`. This shows the sending and success animations without production delivery or FFmpeg. Use `CONTACT_DEV_MOCK=error` to preview the delayed error state. Development mocks are disabled in production; details are in [contact-api/README.md](contact-api/README.md).
