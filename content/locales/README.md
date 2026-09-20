# Locales

`ru.json` and `en.json` are the authored sources of public copy. Keep normal spaces here;
do not add `&nbsp;` or non-breaking spaces manually.

`npm run locales:build` validates locale structure, applies language-aware
typography, and generates the runtime files in `app/generated/locales/`. The generated
JSON is ignored by Git and is rebuilt automatically before dev/build/generate.

Both files must keep the same shape. The generator rejects missing keys or
array-shape drift before Nuxt starts.
