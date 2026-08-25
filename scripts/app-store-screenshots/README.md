# App Store screenshot localization

The ten clean backgrounds in `app-store-screenshots/_backgrounds` are exported from the Figma `App Store` page with the marketing text layers temporarily hidden. The Figma file is restored after export; localization happens locally.

Run the proof of concept in the requested order:

```sh
node scripts/app-store-screenshots/render.mjs
```

This writes:

```text
app-store-screenshots/iphone/en/01.png … 05.png
app-store-screenshots/iphone/nl/01.png … 05.png
app-store-screenshots/ipad/en/01.png   … 05.png
app-store-screenshots/ipad/nl/01.png   … 05.png
```

Add a locale by adding one object to `translations.json`; the renderer will produce both devices and all five screenshots automatically. The CLI also accepts an explicit locale list, for example `node scripts/app-store-screenshots/render.mjs en nl`.

The renderer uses ImageMagick (`magick`) and the system `.SF NS` font to match the Figma SF Pro typography. The marketing copy is composited as SVG so line breaks, alignment, color, weight, and letter spacing stay data-driven.
