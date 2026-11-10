# Pantry – grocery app for iPhone

Plain HTML/CSS/JS. No build step, no server. Data stays on the phone (IndexedDB via Dexie).

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout: tabs, lists, the add/edit dialog |
| `style.css` | Styling (light + dark mode) |
| `app.js` | All the logic: database, rendering, reminders, backup |
| `dexie.min.js` | Dexie library (stored locally so it works offline) |
| `manifest.json` | App name, icon, colors for "Add to Home Screen" |
| `sw.js` | Service worker – caches files so the app opens offline |
| `icons/` | Home screen icons |

## Test on your laptop

Open the folder in VS Code → right-click `index.html` → **Open with Live Server**.
(Opening the file directly with a double click won't work – the service worker needs http.)

## Put it on your iPhone

1. Create a **public** repo on GitHub, e.g. `pantry`, and upload all files (keep the `icons` folder).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
3. After ~1 minute it's live at `https://satishkaji.github.io/pantry/`.
4. Open that URL in **Safari** on the iPhone → Share button → **Add to Home Screen**.
5. Always open it from the home screen icon (that's what keeps your data safe from Safari's cleanup).

## Updating the app

1. Change the files and push to GitHub.
2. In `sw.js`, bump `CACHE_NAME` (`pantry-v1` → `pantry-v2`). Without this the phone keeps the old version.
3. Close and reopen the app on the phone (sometimes twice).

## Backups

Settings → **Export backup** opens the iPhone share sheet → *Save to Files*.
Do this now and then: deleting the home screen icon deletes the data.
