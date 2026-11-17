# Demi Somi Finds

A premium, eye-friendly mini online store for women's beauty and makeup products — lipsticks, skincare, mascara, blush and more. Visitors browse products on a public storefront; the owner manages everything (products, images, social links, settings) from a secure admin panel. No cart or checkout: each product links out to the retailer's site (or shows "Contact to order" when no buy link is set yet).

**Stack:** Node.js 20 + Express, SQLite via better-sqlite3 (one single-file database), bcryptjs for password hashing, jsonwebtoken for admin sessions, multer + sharp for image uploads, helmet + express-rate-limit for security. Vanilla HTML/CSS/JS frontend with **no build step**. One service serves the storefront, the admin panel and the API — one deploy, one public URL, and SQLite is a single file, so there is no external database to configure. That is the most beginner-friendly path to a real, persistent, multi-visitor store.

## Project structure

```
demi-somi-finds/
├── server.js            # Express app: storefront, admin panel, API, auth, uploads
├── db.js                # SQLite setup, schema, settings/product helpers
├── seed.js              # First-run seed: 5 demo products + default settings + demo admin
├── package.json
├── render.yaml          # Render blueprint for one-click deploy
├── .env.example         # Copy to .env and fill in (never commit a real .env)
├── public/
│   ├── index.html       # Public storefront (data comes from the API)
│   ├── admin.html       # Admin panel (login + dashboard)
│   ├── css/style.css    # Shared design system (storefront + admin)
│   ├── css/admin.css    # Admin dashboard styles
│   ├── js/store.js      # Storefront logic + all motion/interactions
│   ├── js/admin.js      # Admin panel logic
│   ├── favicon.svg
│   ├── sitemap.xml      # Replace the example.com domain with your real URL
│   └── robots.txt
├── data/                # Created on first run (gitignored except .gitkeep)
│   ├── store.db         # SQLite database (products, settings, admin)
│   └── uploads/         # Uploaded product images
├── README.md            # This file
├── ADMIN-GUIDE.md       # How to use the admin panel
└── CHOICES.md           # Choices made on your behalf
```

## Run locally (your computer)

Requirements: **Node.js 20 or newer** (check with `node --version`).

```bash
npm install     # install dependencies (first time only)
npm run seed    # load the 5 demo products + default settings + demo admin
npm start       # start the server
```

Then open:

- Store: http://localhost:3000
- Admin panel: http://localhost:3000/admin

> The server also seeds itself automatically on startup if the database is empty, so `npm run seed` is only needed the first time (or after deleting `data/store.db`).

## First login — very important

1. Open http://localhost:3000/admin.
2. Sign in with the **demo credentials given to you at delivery** (username `admin`).
3. You are **immediately forced to create your own credentials**: choose a new username and a strong new password (at least 10 characters, with upper + lowercase, a number and a special character; a strength meter helps you).
4. After you save, the **demo credentials stop working permanently**. From then on, only your own username and password open the admin panel.

> The demo password is **not written anywhere in this project** — only its bcrypt hash is in `seed.js`. Keep your own password safe and do not share it.

If you ever lock yourself out (5 wrong attempts locks the account for 15 minutes), wait 15 minutes and try again, or delete `data/store.db` and run `npm run seed` again to start over (this erases all products and settings too).

## Deploy to a public link (Render — free tier)

Render is the recommended host because the included `render.yaml` blueprint creates the free web service in one step. One honest limit: Render's free tier does NOT allow persistent disks, so the SQLite database and uploaded images are wiped on every restart/redeploy. The build re-runs the seed script, so the 5 demo products always come back — but products you add in the admin panel will be lost on a restart. For permanent storage, upgrade to the Starter plan (~$7/month) and add a disk.

1. **Put the code on GitHub.** Create a free GitHub account if needed, make a new repository, and upload this whole folder (except `node_modules/` and `data/store.db` — both are gitignored already).
2. **In Render** (render.com, free account): click **New + → Blueprint**, connect your GitHub account, and select the repository. Render reads `render.yaml` and creates the web service.
3. Render generates a **JWT_SECRET** automatically and sets `NODE_ENV=production`. Wait for the first deploy to finish (a few minutes).
4. Your public link looks like `https://demi-somi-finds.onrender.com`. Open it — the store loads with the 5 demo products. The admin panel is at `https://demi-somi-finds.onrender.com/admin`.
5. **Sign in with the demo credentials and create your own** (see "First login" above) before sharing the link.
6. **Update the sitemap domain:** edit `public/sitemap.xml` and `public/robots.txt`, replacing `https://demi-somi-finds.example.com` with your real Render URL, then push the change to GitHub (Render redeploys automatically).

**Honest notes about the free tier:**

- The free web service **sleeps after ~15 minutes of inactivity** — the first visit after a nap can take up to a minute to wake up. That is normal on the free plan; a paid plan ($7/month) keeps it always awake.
- **No persistent disk on the free plan:** products, settings and uploaded images reset on every restart/redeploy. The 5 demo products always come back (the build re-seeds them), but your own additions do not. Upgrade to the Starter plan (~$7/month) and add a disk if you want everything to stay permanently.
- The free tier has limited monthly hours, which is plenty for a small store.

**Other hosts that also work** (no blueprint included, same idea): Railway, Fly.io, or any VPS with Node.js 20+. On any host, set the `JWT_SECRET` environment variable to a long random string, and make sure `data/` is stored on a persistent volume — otherwise the database resets on restart.

## How the store works

- **Products** come from the SQLite database via `/api/products` — never from hardcoded HTML. Edit them in the admin panel and every visitor sees the change instantly.
- **Buy button:** if a product has a buy link, the button opens it in a new tab. If the buy link is empty, the product shows **"Contact to order"** instead — no buy button appears until you add a link.
- **Social icons** in the footer start empty. Add your Facebook, TikTok, Instagram and YouTube Shorts links in the admin panel (Social Links) and the icons become clickable. Empty links show as dimmed.
- **Announcement bar, trust badges, hero text, about text and the affiliate disclosure** are all editable in Store Settings. The announcement bar and disclosure can each be turned off.
- **Legal pages** (Privacy, Terms, Shipping & Returns) have placeholder text you can edit in the admin panel (Legal Pages). The first line of each text becomes the page heading.
- **Images:** product images are uploaded in the admin panel (JPG/PNG/WebP, up to 5 MB each). They are automatically resized to a maximum of 1200px and compressed. The 5 demo products use built-in SVG illustrations, so the store looks complete with no external images.

## Configuration

Copy `.env.example` to `.env` for local development:

```
PORT=3000
JWT_SECRET=<a long random string>
NODE_ENV=development
```

Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

- **JWT_SECRET** signs admin login tokens. If it is not set, the server generates a random one on startup and warns you — but then every admin is logged out whenever the server restarts. Always set it in production (Render generates one for you via `render.yaml`).
- **PORT** is set automatically by Render; locally it defaults to 3000.

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE` / port already in use | Another server is running on port 3000. Stop it, or run `PORT=4000 npm start` and open http://localhost:4000. |
| `npm install` fails on `better-sqlite3` | Needs a prebuilt binary for your Node version. Use Node 20+ (the project pins better-sqlite3 v12, which ships Node 20/22/24 binaries). As a fallback, install build tools (Python, make, g++) and retry. |
| Admin login says "Session expired" after a restart | You have no `JWT_SECRET` set, so the server generated a new random secret. Set `JWT_SECRET` in `.env` (or Render env vars) and sign in again. |
| Images look stretched | Product images are shown with `object-fit: cover` in a 4:5 frame. Square or portrait photos look best. |
| Store shows no products | Check the server is running and `/api/products` returns data. In the admin panel, make sure products are marked "Visible on the store". |
| I forgot my admin password | There is no password recovery by design. Delete `data/store.db`, run `npm run seed`, and sign in with the demo credentials again (this erases all products/settings too). |

## Security notes

- All admin routes and APIs check the JWT on the server — the admin pages are not just hidden by the frontend.
- Passwords are hashed with bcrypt (cost 12) and never stored or shown in plain text.
- Login is rate-limited (10 attempts / 15 min per IP) and the account locks for 15 minutes after 5 wrong passwords.
- Inputs are validated and all database queries use prepared statements (no SQL injection). Output is escaped (no XSS from product text).
- Uploads accept only JPG/PNG/WebP, max 5 MB, and are served from `data/uploads` — never executed as code.
- Security headers are set with Helmet, including a strict Content Security Policy.
