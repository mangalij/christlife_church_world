# ⛪ ChristLife World

A 3D browser game — a Roblox-inspired church world built with **Three.js**, **Vite**,
**Firebase Realtime Database**, and **PWA** support. Works on desktop and mobile, and
installs to the home screen.

> *Build your church. Grow your congregation. Change the world.*

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure Firebase (optional — game runs single-player without it)
cp .env.local.example .env.local
# edit .env.local with your Firebase project credentials

# 3. Run dev server
npm run dev

# 4. Build for production
npm run build
npm run preview
```

Open http://localhost:5173 and you'll land on the character creation screen.

---

## Firebase setup (multiplayer + chat + global member count)

1. Create a Firebase project at https://console.firebase.google.com.
2. Enable **Realtime Database** and **Anonymous Authentication**.
3. Copy your project's web config into `.env.local`:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_DATABASE_URL=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

4. Paste these rules into **Realtime Database → Rules**:

   ```json
   {
     "rules": {
       "worlds": {
         "christlife": {
           "players": {
             "$uid": {
               ".read": "auth != null",
               ".write": "auth != null && auth.uid === $uid"
             }
           },
           "membership": { ".read": "auth != null", ".write": "auth != null" },
           "chat":       { ".read": "auth != null", ".write": "auth != null" }
         }
       }
     }
   }
   ```

If `.env.local` is missing or blank, the game still runs — chat, who's-here, and
shared member count are simply disabled.

---

## Controls

### Desktop
| Action     | Key |
| ---------- | --- |
| Move       | WASD / Arrows |
| Sprint     | Shift |
| Jump       | Space |
| Interact   | E |
| Camera     | V (toggle 1st/3rd person) |
| Players    | Tab |
| Chat       | Enter |
| Look       | Mouse (click canvas to lock pointer) |

### Mobile
- Joystick (bottom left) — move
- Right-side drag — look
- ⚡ Sprint · 👁 Camera · 👥 Players · 💬 Chat · ↑ Jump · E Interact

---

## PWA / Icons

Place icons in `public/icons/` (see `public/icons/README.md`). A master SVG is
included. Quickest path:

```bash
npx pwa-asset-generator public/icons/icon-master.svg public/icons \
  --background "#7C3AED" --opaque true --padding "10%"
```

---

## Deploy to Vercel

1. Push the `christlife-world` folder to a GitHub repo.
2. Import the repo at https://vercel.com/new — Vite is auto-detected.
3. Add the `VITE_FIREBASE_*` variables in **Project Settings → Environment Variables**.
4. Deploy. Visit the `.vercel.app` URL on mobile Chrome → "Add to Home Screen".

The included `vercel.json` sets the correct cache/MIME headers for the service
worker and manifest.

---

## Project layout

```
christlife-world/
├─ src/
│  ├─ main.js          entry point, scene + loop
│  ├─ world.js         church map (sanctuary, foyer, courtyard, …)
│  ├─ player.js        controller, camera, mobile joystick
│  ├─ npc.js           NPC data + wandering AI + dialogue triggers
│  ├─ multiplayer.js   Firebase Realtime DB sync + chat
│  ├─ firebase.js      Firebase init (safe no-op without env)
│  ├─ ui.js            HUD, dialogue box, modal, toasts
│  ├─ audio.js         Web Audio ambient + chimes
│  ├─ growth.js        membership counter, milestones, expansions
│  └─ minigames/
│     ├─ trivia.js       Bible Trivia
│     ├─ memoryMatch.js  Memory Verse Match
│     └─ rhythmTap.js    Worship Rhythm Tap
├─ public/
│  ├─ icons/           PWA icons (generate from icon-master.svg)
│  ├─ screenshots/     PWA install-prompt screenshots
│  ├─ assets/          (optional textures/audio)
│  ├─ manifest.json    backup manifest (vite-plugin-pwa auto-generates one)
│  └─ offline.html     offline fallback
├─ index.html
├─ vite.config.js      PWA plugin + workbox config
├─ vercel.json
└─ package.json
```

---

## Notes on the spec

- The original `isMobile` regex spanned multiple lines (invalid JS). Fixed to a
  single line in `src/main.js`.
- `multiplayer.js` switched from `set(...)` to `update(...)` for periodic
  position writes so the `name`/`shirt` fields aren't wiped each tick.
- Trivia/memory/rhythm minigames now wire `addEventListener` instead of inline
  `onclick="window.__..."` so the modal works under stricter CSPs.
- Firebase is optional — if `.env.local` is missing, the game runs single-player
  with local membership counter.
