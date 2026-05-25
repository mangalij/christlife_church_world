# PWA Icons

This folder needs PNG icons at these sizes:

- icon-72.png, icon-96.png, icon-128.png, icon-144.png,
  icon-152.png, icon-192.png, icon-384.png, icon-512.png
- maskable-icon.png (512x512, with 10% safe-zone padding)
- apple-touch-icon.png (180x180)

## Quick generation

A master SVG is provided: `icon-master.svg`.

### Option 1 — pwa-asset-generator (recommended)

```bash
npx pwa-asset-generator public/icons/icon-master.svg public/icons \
  --background "#7C3AED" \
  --opaque true \
  --padding "10%" \
  --manifest public/manifest.json \
  --index index.html
```

### Option 2 — sharp-cli

```bash
npm install -g sharp-cli
for s in 72 96 128 144 152 192 384 512; do
  sharp -i public/icons/icon-master.svg -o public/icons/icon-$s.png resize $s $s
done
sharp -i public/icons/icon-master.svg -o public/icons/apple-touch-icon.png resize 180 180
sharp -i public/icons/icon-master.svg -o public/icons/maskable-icon.png resize 512 512
```

### Option 3 — Visual

Use https://maskable.app and https://realfavicongenerator.net to generate all sizes
from the master SVG.

Until icons exist, the PWA install prompt may not appear, but the game itself runs fine.
