# Main social sharing artwork

`home-keycap.png` is the imagegen-edited master of the main KADO social card.
The reference keycap and the supplied English `public/brand/kado-logo-en.svg`
wordmark were used as inputs. The source is kept outside `public/` so visitors
only download the optimized 1200×630 JPEG at `/og/home.jpg`.

Image text:

- Websites with character.
- Independent design & development
- kadonext.com

Final edit prompt: “Replace only the second large headline line ‘a character.’
with ‘character.’. Preserve the English kado wordmark, resin key with the white
perspective-correct ō, forest, materials, lighting, background, subtitle and URL.”

The original generation requested a landscape editorial OG composition from
the user's resin keycap image: the key on the right, a white lowercase Latin ō
on its top face, the supplied English logo and headline on the left, restrained
grey background, and no additional objects or decorative motifs.

`npm run seo:images` resizes the master and writes `/og/home.jpg` on every build.
The original attached image is not modified. HTML titles and descriptions stay
in Russian to match the language of the actual website.
