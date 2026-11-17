/**
 * seed.js — first-run seed data for Demi Somi Finds.
 *
 * Run:  npm run seed
 * It is idempotent: it only fills in what is missing, so running it again
 * never overwrites the owner's products, settings or admin account.
 * The server also calls seed() on startup when the tables are empty.
 *
 * SECURITY: the demo admin password is stored here ONLY as a bcrypt hash.
 * The plain-text demo password is never written into any project file.
 * It is given to the store owner separately, once, at delivery time.
 */
'use strict';

const { db, getSetting, setSetting } = require('./db');

/* ------------------------------------------------------------------ */
/* Demo admin account (first login forces a credential change)         */
/* username: admin                                                     */
/* password: <given to the owner separately — hash only, see below>    */
/* ------------------------------------------------------------------ */
const DEMO_ADMIN_USERNAME = 'admin';
// bcrypt hash (cost 12) of the demo password. Never replace this with
// plain text. After the owner changes credentials, this row is replaced.
const DEMO_ADMIN_PASSWORD_HASH =
  '$2a$12$fSeipSeg4qetU1ErPdLbP.PpGEXyoof.giFliHzDrjQ.JsQvoUNcq';

/* ------------------------------------------------------------------ */
/* Default store settings                                              */
/* ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  store_name: 'Demi Somi Finds',
  theme: 'lavender',
  // The owner's own two-color theme (admin panel → Store Settings → Custom theme).
  // Same colors as the default dark theme until he picks his own.
  custom_theme: JSON.stringify({ primary: '#8b4fc0', secondary: '#d9a441', name: 'My Theme' }),
  tagline: 'Beauty finds you will love — curated for every skin tone.',
  hero_headline: 'Beauty finds that feel made for you.',
  hero_subheadline:
    'Soft, everyday luxury — lipsticks, skincare and little rituals that brighten your day. Handpicked, honestly reviewed, and made to be shared.',
  announcement_text: 'Free shipping on orders over $35',
  announcement_enabled: '1',
  about_text:
    'Demi Somi Finds started with a simple idea: great beauty should feel easy. ' +
    'We try the products, read the labels, and only share the ones we genuinely love — ' +
    'from a perfect everyday lipstick to the serum that makes your skin look well-rested. ' +
    'Every shade range is chosen with all skin tones in mind, because beauty is for everyone.',
  contact_email: 'hello@demisomifinds.com',
  currency: '$',
  trust_badges: JSON.stringify(['Cruelty-free finds', 'Secure checkout', 'Easy returns']),
  disclosure_text:
    'Some links may be affiliate links. We may earn a commission at no extra cost to you.',
  disclosure_enabled: '1',
  social_facebook: '',
  social_tiktok: '',
  social_instagram: '',
  social_youtube: '',
  legal_privacy:
    'Privacy Policy\n\n' +
    'We care about your privacy. This website collects only the information needed to run the store, ' +
    'such as anonymous visit statistics. We do not sell your personal information.\n\n' +
    'If you contact us by email, we use your message only to reply to you. ' +
    'Cookies on this site are used to remember simple preferences, like your theme choice and whether you dismissed the cookie notice.\n\n' +
    'California residents: under the CCPA you may request to know what personal information we hold about you and ask us to delete it. ' +
    'Contact us at the email shown on this site to make a request.\n\n' +
    '(Edit this text from the admin panel: Settings / Legal Pages.)',
  legal_terms:
    'Terms of Use\n\n' +
    'Welcome to Demi Somi Finds. By using this website you agree to these terms.\n\n' +
    'This site showcases beauty products. Prices and availability may change without notice. ' +
    'Some product links are affiliate links: if you buy through them, we may earn a commission at no extra cost to you.\n\n' +
    'Product descriptions are for general information only and are not medical advice. ' +
    'If you have sensitive skin or allergies, please check the full ingredient list on the product page or the brand website before use.\n\n' +
    '(Edit this text from the admin panel: Settings / Legal Pages.)',
  legal_shipping:
    'Shipping & Returns\n\n' +
    'Orders are fulfilled by the retailer you buy from — when you click a Buy button you are taken to that retailer’s website, ' +
    'and their shipping and returns policy applies to your order.\n\n' +
    'Free shipping on orders over $35 applies where the retailer offers it; check the retailer’s checkout page for the final shipping cost.\n\n' +
    'If something arrives damaged or is not right, please contact the retailer directly — or reach out to us and we will help point you in the right direction.\n\n' +
    '(Edit this text from the admin panel: Settings / Legal Pages.)',
};

/* ------------------------------------------------------------------ */
/* Inline SVG placeholder art (no external images needed)              */
/* Each product gets a soft-gradient backdrop + a simple line illustration. */
/* ------------------------------------------------------------------ */
function svgWrap(inner, c1, c2) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" role="img" aria-hidden="true">' +
    '<defs>' +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    '</linearGradient>' +
    '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>' +
    '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
    '</linearGradient>' +
    '</defs>' +
    `<rect width="720" height="900" fill="url(#bg)"/>` +
    '<circle cx="600" cy="140" r="120" fill="#ffffff" opacity="0.25"/>' +
    '<circle cx="110" cy="760" r="140" fill="#ffffff" opacity="0.22"/>' +
    '<circle cx="640" cy="700" r="60" fill="#ffffff" opacity="0.18"/>' +
    // soft petals
    '<ellipse cx="150" cy="180" rx="26" ry="12" fill="#E8A0A0" opacity="0.55" transform="rotate(-30 150 180)"/>' +
    '<ellipse cx="560" cy="820" rx="26" ry="12" fill="#E8A0A0" opacity="0.45" transform="rotate(25 560 820)"/>' +
    '<ellipse cx="360" cy="770" rx="90" ry="18" fill="#000000" opacity="0.08"/>' +
    inner +
    '</svg>'
  );
}

function lipstickArt() {
  return svgWrap(
    '<g>' +
      // bullet tip
      '<path d="M330 250 L360 180 Q375 165 390 180 L390 250 Z" fill="#C96F5A"/>' +
      '<path d="M330 250 L390 250 L390 290 L330 290 Z" fill="#B85A48"/>' +
      // gold band
      '<rect x="318" y="290" width="84" height="26" rx="6" fill="#D9B36A"/>' +
      // tube
      '<rect x="308" y="316" width="104" height="330" rx="26" fill="#7A5FA8"/>' +
      '<rect x="308" y="316" width="104" height="330" rx="26" fill="url(#sheen)"/>' +
      '<rect x="330" y="340" width="10" height="280" rx="5" fill="#ffffff" opacity="0.25"/>' +
      // base
      '<rect x="300" y="646" width="120" height="34" rx="12" fill="#5B4B8A"/>' +
    '</g>',
    '#F3E3EE', '#E4D6F2'
  );
}

function serumArt() {
  return svgWrap(
    '<g>' +
      // dropper cap
      '<rect x="322" y="196" width="76" height="118" rx="18" fill="#5B4B8A"/>' +
      '<rect x="322" y="196" width="76" height="118" rx="18" fill="url(#sheen)"/>' +
      '<rect x="346" y="314" width="28" height="46" fill="#8E7CC3"/>' +
      // bottle neck + bottle
      '<rect x="300" y="360" width="120" height="26" rx="8" fill="#A8C5A0"/>' +
      '<rect x="272" y="386" width="176" height="300" rx="44" fill="#CFE3D2"/>' +
      '<rect x="272" y="386" width="176" height="300" rx="44" fill="url(#sheen)"/>' +
      // liquid
      '<rect x="292" y="470" width="136" height="196" rx="30" fill="#A8C5A0" opacity="0.85"/>' +
      // label
      '<rect x="296" y="520" width="128" height="86" rx="12" fill="#FAF6F1"/>' +
      '<rect x="312" y="540" width="96" height="8" rx="4" fill="#8E7CC3"/>' +
      '<rect x="312" y="558" width="70" height="8" rx="4" fill="#C9BEE3"/>' +
      '<rect x="312" y="576" width="84" height="8" rx="4" fill="#C9BEE3"/>' +
      // droplet
      '<path d="M360 660 q14 20 0 30 q-14 -10 0 -30" fill="#8E7CC3"/>' +
    '</g>',
    '#EAF3EA', '#DCEADF'
  );
}

function compactArt() {
  return svgWrap(
    '<g>' +
      // open lid (tilted ellipse)
      '<ellipse cx="360" cy="330" rx="180" ry="72" fill="#EFE6DC" transform="rotate(-14 360 330)"/>' +
      '<ellipse cx="360" cy="330" rx="150" ry="54" fill="#FAF6F1" transform="rotate(-14 360 330)"/>' +
      // base compact
      '<circle cx="360" cy="560" r="185" fill="#D9C6B2"/>' +
      '<circle cx="360" cy="560" r="168" fill="#EFE6DC"/>' +
      // powder pan
      '<circle cx="360" cy="560" r="128" fill="#E8B4A0"/>' +
      '<circle cx="360" cy="560" r="128" fill="url(#sheen)"/>' +
      '<path d="M280 540 Q340 500 420 545 Q380 590 300 580" fill="none" stroke="#D98A76" stroke-width="10" stroke-linecap="round" opacity="0.7"/>' +
      // hinge
      '<rect x="330" y="392" width="60" height="20" rx="8" fill="#B9A58F"/>' +
    '</g>',
    '#F7EDE3', '#F1E2D5'
  );
}

function mascaraArt() {
  return svgWrap(
    '<g>' +
      // wand (angled, top right)
      '<g transform="rotate(24 470 300)">' +
      '<rect x="462" y="180" width="14" height="120" fill="#5B4B8A"/>' +
      '<rect x="448" y="300" width="42" height="90" rx="20" fill="#3E3456"/>' +
      '<g stroke="#3E3456" stroke-width="5" stroke-linecap="round">' +
      '<line x1="446" y1="312" x2="492" y2="312"/><line x1="446" y1="326" x2="492" y2="326"/>' +
      '<line x1="446" y1="340" x2="492" y2="340"/><line x1="446" y1="354" x2="492" y2="354"/>' +
      '<line x1="446" y1="368" x2="492" y2="368"/>' +
      '</g></g>' +
      // tube
      '<rect x="268" y="330" width="104" height="360" rx="50" fill="#5B4B8A"/>' +
      '<rect x="268" y="330" width="104" height="360" rx="50" fill="url(#sheen)"/>' +
      '<rect x="292" y="360" width="10" height="300" rx="5" fill="#ffffff" opacity="0.25"/>' +
      // cap band
      '<rect x="268" y="330" width="104" height="44" rx="22" fill="#3E3456"/>' +
      // label
      '<rect x="288" y="470" width="64" height="90" rx="10" fill="#FAF6F1"/>' +
      '<rect x="300" y="490" width="40" height="7" rx="3.5" fill="#8E7CC3"/>' +
      '<rect x="300" y="506" width="40" height="7" rx="3.5" fill="#C9BEE3"/>' +
      '<rect x="300" y="522" width="28" height="7" rx="3.5" fill="#C9BEE3"/>' +
    '</g>',
    '#ECE6F5', '#DCD2EE'
  );
}

function blushArt() {
  return svgWrap(
    '<g>' +
      // palette case
      '<rect x="180" y="400" width="360" height="280" rx="30" fill="#F3E3D8"/>' +
      '<rect x="180" y="400" width="360" height="280" rx="30" fill="url(#sheen)"/>' +
      '<rect x="180" y="400" width="360" height="280" rx="30" fill="none" stroke="#D9C6B2" stroke-width="4"/>' +
      // four pans
      '<circle cx="270" cy="490" r="52" fill="#E8A0A0"/>' +
      '<circle cx="450" cy="490" r="52" fill="#D97B7B"/>' +
      '<circle cx="270" cy="600" r="52" fill="#F2C4B3"/>' +
      '<circle cx="450" cy="600" r="52" fill="#C98A9B"/>' +
      '<circle cx="270" cy="490" r="52" fill="url(#sheen)"/>' +
      '<circle cx="450" cy="490" r="52" fill="url(#sheen)"/>' +
      '<circle cx="270" cy="600" r="52" fill="url(#sheen)"/>' +
      '<circle cx="450" cy="600" r="52" fill="url(#sheen)"/>' +
      // tiny brush
      '<g transform="rotate(-18 590 350)">' +
      '<rect x="584" y="300" width="12" height="70" fill="#8E7CC3"/>' +
      '<ellipse cx="590" cy="292" rx="16" ry="26" fill="#E8A0A0"/>' +
      '</g>' +
    '</g>',
    '#F9E9E4', '#F3DCD6'
  );
}

function toDataUri(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* ------------------------------------------------------------------ */
/* Demo products (realistic US beauty-market prices, cosmetic-safe copy) */
/* ------------------------------------------------------------------ */
const DEMO_PRODUCTS = [
  {
    name: 'Velvet Rose Matte Lipstick',
    title: 'Matte Comfort Lipstick',
    description:
      'A velvety matte lipstick in a universally flattering rose that glides on smoothly and wears comfortably for hours. ' +
      'The creamy, non-drying formula gives rich color in one swipe, with a soft-focus finish that flatters every skin tone. ' +
      'Available in a shade range made for light to deep complexions.',
    price: 18.99,
    category: 'Lipstick',
    buy_link: '',
    images: [toDataUri(lipstickArt())],
  },
  {
    name: 'Glow Hydra Face Serum',
    title: 'Lightweight Hydrating Serum',
    description:
      'A lightweight, fast-absorbing serum that leaves skin looking dewy, fresh and comfortably hydrated. ' +
      'Layer it under your moisturizer, morning or night — it plays well with the rest of your routine ' +
      'and suits all skin types, including sensitive skin.',
    price: 24.99,
    category: 'Skincare',
    buy_link: '',
    images: [toDataUri(serumArt())],
  },
  {
    name: 'Silk Touch Compact Powder',
    title: 'Soft-Focus Setting Powder',
    description:
      'A silky pressed powder that blurs the look of pores and sets makeup with a soft, natural finish — never cakey. ' +
      'The finely milled formula comes in a range of shades for fair to deep skin tones, ' +
      'with a built-in mirror and puff for touch-ups on the go.',
    price: 21.99,
    category: 'Face',
    buy_link: '',
    images: [toDataUri(compactArt())],
  },
  {
    name: 'Lash Lift Volume Mascara',
    title: 'Volumizing Lengthening Mascara',
    description:
      'A buildable volumizing mascara that lifts, lengthens and defines every lash without clumps or flakes. ' +
      'The curved brush reaches corner to corner, so lashes look fuller and more lifted from root to tip.',
    price: 16.99,
    category: 'Mascara',
    buy_link: '',
    images: [toDataUri(mascaraArt())],
  },
  {
    name: 'Petal Soft Blush Palette',
    title: 'Four-Shade Blush Palette',
    description:
      'Four blendable blush shades — from a soft petal pink to a warm terracotta — that melt into skin ' +
      'for a fresh, healthy-looking flush. Mix and match to find your perfect glow, whatever your skin tone.',
    price: 26.99,
    category: 'Blush',
    buy_link: '',
    images: [toDataUri(blushArt())],
  },
];

/* ------------------------------------------------------------------ */
/* Seed runner (idempotent)                                            */
/* ------------------------------------------------------------------ */
function seed() {
  const now = new Date().toISOString();

  // 1. Default settings — only fill keys that are missing.
  let settingsAdded = 0;
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const seedSettings = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const info = insertSetting.run(key, value);
      if (info.changes > 0) settingsAdded++;
    }
  });
  seedSettings();

  // 2. Demo products — only when the products table is empty.
  const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  let productsAdded = 0;
  if (productCount === 0) {
    const insertProduct = db.prepare(
      'INSERT INTO products (name, title, description, price, category, buy_link, images, visible, sort_order, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
    );
    const seedProducts = db.transaction(() => {
      DEMO_PRODUCTS.forEach((p, i) => {
        insertProduct.run(
          p.name, p.title, p.description, p.price, p.category,
          p.buy_link, JSON.stringify(p.images), i + 1, now, now
        );
        productsAdded++;
      });
    });
    seedProducts();
  }

  // 3. Demo admin — only when there is no admin account at all.
  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  let adminAdded = false;
  if (adminCount === 0) {
    db.prepare(
      'INSERT INTO admin_users (username, password_hash, must_change, created_at, updated_at) ' +
      'VALUES (?, ?, 1, ?, ?)'
    ).run(DEMO_ADMIN_USERNAME, DEMO_ADMIN_PASSWORD_HASH, now, now);
    adminAdded = true;
  }

  return { settingsAdded, productsAdded, adminAdded };
}

// Run directly: `node seed.js`
if (require.main === module) {
  const result = seed();
  console.log('Seed complete:', JSON.stringify(result));
  console.log('Demo products:', DEMO_PRODUCTS.map((p) => p.name).join(' | '));
  if (result.adminAdded) {
    console.log('Demo admin account created (username: admin).');
    console.log('IMPORTANT: the demo password is NOT printed here — it was given to the owner at delivery time.');
  }
}

module.exports = { seed, DEFAULT_SETTINGS, DEMO_PRODUCTS, DEMO_ADMIN_USERNAME };
