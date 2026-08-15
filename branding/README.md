# Anonchat branding

Square PNG renders of the Anonchat logo, in the sizes most commonly needed
by app stores, PWA manifests, favicons, and platform marketplaces.

| File | Typical use |
|------|-------------|
| `anonchat-16.png` / `anonchat-32.png` / `anonchat-48.png` | favicons |
| `anonchat-96.png` / `anonchat-128.png` | PWA icons, dashboards |
| `anonchat-180.png` | apple-touch-icon |
| `anonchat-192.png` / `anonchat-512.png` | PWA manifest icons |
| `anonchat-256.png` | general embed/og images |
| `anonchat-1024.png` | original size; store listings and marketing |

The source file is the 1024 px render — resize from it when a new size is
needed (`sips -z <size> <size> anonchat-1024.png --out anonchat-<size>.png`).
