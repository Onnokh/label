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

The renderer uses ImageMagick (`magick`) and the system `.SF NS` font to match the Figma SF Pro typography. Text is rasterized into a transparent overlay so ImageMagick's font weight and kerning are applied consistently. Each line is measured before rendering: Figma-style tighter tracking is applied, and the font size scales down proportionally to keep every translation inside an 88% safe area within its artboard text box.
