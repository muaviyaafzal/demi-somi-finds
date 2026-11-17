# How to Use the Admin Panel — Demi Somi Finds

The admin panel lives at **`/admin`** on your site (for example `https://demi-somi-finds.onrender.com/admin`). It is only for you — visitors never see it.

## 1. First sign-in (do this once)

1. Open `/admin` and sign in with the **demo credentials given to you at delivery** (username `admin`).
2. You are immediately taken to **"Create your own credentials"**. Choose:
   - **New username** — letters, numbers, dot, underscore or hyphen.
   - **New password** — at least 10 characters, with an uppercase letter, a lowercase letter, a number and a special character. The strength bar turns green when it is strong.
   - **Confirm password** — type it again exactly.
3. Click **Save My Credentials**. From now on, the demo login **no longer works** — only your new username and password open the panel.
4. If you are signed in on another device, sign in again with your new credentials there.

> Forgot your password? There is no reset email. Delete `data/store.db` on the server/host, run `npm run seed` again, and sign in with the demo credentials (this erases all products and settings, so only do it if you must).

## 2. Products — add, edit, delete, reorder

Open the **Products** tab to see all products (including hidden ones).

### Add a product
1. Click **+ Add Product** (or the **Add Product** tab).
2. Fill in:
   - **Product name** (required) — e.g. `Velvet Rose Matte Lipstick`
   - **Short title** — e.g. `Matte Comfort Lipstick`
   - **Price (USD)** — numbers only, e.g. `18.99`
   - **Category** — e.g. `Lipstick`, `Skincare`, `Blush` (type a new one or pick an existing one)
   - **Description** — short and attractive. Use cosmetic-safe wording only (no medical claims like "cures" or "removes wrinkles").
   - **Buy link (optional)** — the full product URL, e.g. an Amazon link. **Leave it empty and the store shows "Contact to order" instead of a Buy button.** Add the link later whenever you are ready — the Buy button appears automatically.
   - **Images** — see below.
   - **Visible on the store** — uncheck to hide a product without deleting it.
3. Click **Save Product**. It appears on the public store immediately.

### Edit a product
Click **Edit** next to any product, change anything, and click **Save Product**.

### Delete a product
Click **Delete**, then confirm. This cannot be undone.

### Reorder products
Drag a product row by the **⠿ handle** and drop it where you want it. The new order is saved automatically and shows on the store right away.

## 3. Images

In the product form, under **Images**:

- **Upload Images** — pick JPG, PNG or WebP files (up to 5 MB each). They are resized to max 1200px and compressed automatically. You can upload several at once.
- **Or paste an image URL** — paste a full `https://…` image link and click **Add**.
- The **first image is the main one** (marked "Main") — it is the one shown on the product card. Remove an image with the **✕** on its corner.
- At most 6 images per product.

## 4. Social links

Open the **Social Links** tab and paste your profile/page URLs for **Facebook, TikTok, Instagram and YouTube Shorts**, then click **Save Social Links**. The footer icons on the store become clickable instantly. Leave a field empty and that icon stays dimmed.

## 5. Store settings

Open the **Store Settings** tab:

- **Store name, tagline, currency symbol** — the currency is just the symbol shown before prices (default `$`).
- **Hero headline / subheadline** — the big text at the top of the store.
- **Announcement bar text** + **Show announcement bar** — uncheck to hide the bar completely.
- **About text** — the brand story section.
- **Contact email** — shown on the Contact section (visitors click it to email you).
- **Trust badges** — the three "Why choose us" cards (defaults: Cruelty-free finds, Secure checkout, Easy returns).
- **Affiliate disclosure** + **Show affiliate disclosure** — the footer line about affiliate links; uncheck to hide it.
- **Store theme** — pick one of 5 two-color themes (Plum + Gold, the logo's own colors, is the default). Click a swatch, then **Save Settings** — the whole store changes colors instantly for every visitor.

Click **Save Settings**. Everything updates on the public store immediately.

## 6. Legal pages

Open the **Legal Pages** tab to edit the **Privacy Policy**, **Terms of Use** and **Shipping & Returns** texts. The first line of each box becomes the page heading. Click **Save Legal Pages**.

## 7. Account

Open the **Account** tab to:

- **Change username** — type the new one and save.
- **Change password** — enter your current password, then the new one twice (same strength rules as before).
- **Logout** — use the **Logout** button at the top right (or the View Store link to preview the store in a new tab).

## Quick tips

- **No Buy button until you add a link:** that is by design. Add products first, add links when you have them.
- **Draft a product first:** uncheck "Visible on the store", save, and check it later when it is ready.
- **Preview as a visitor:** click **View Store ↗** at the top of the admin panel.
- **On your phone:** the admin panel works on mobile too — tabs stack at the top, forms are single-column.
- **Backups:** your products, settings and images live in `data/store.db` and `data/uploads/`. On Render, the persistent disk keeps them safe. For local use, copy the `data/` folder somewhere safe from time to time.
