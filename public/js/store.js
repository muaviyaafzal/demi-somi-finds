/**
 * store.js — Demi Somi Finds public storefront.
 * All product data comes from the API (never hardcoded in HTML).
 * Motion: IntersectionObserver reveals, hero parallax, scroll progress,
 * product hover highlight (CSS) with a tap equivalent for touch.
 * The native mouse cursor is used everywhere — there is no custom
 * cursor (removed 2026-11-17: it hid the real pointer and lagged).
 * Respects prefers-reduced-motion.
 */
'use strict';

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (v === '') return '';
    try {
      const u = new URL(v, window.location.origin);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? v : '';
    } catch {
      return '';
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    return res.json();
  }

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */
  let settings = null;
  let products = [];
  let activeCategory = 'All';
  let searchTerm = '';

  function formatPrice(price) {
    const currency = (settings && settings.currency) || '$';
    const n = Number(price) || 0;
    return currency + n.toFixed(2);
  }

  /* ---------------------------------------------------------------- */
  /* Store theme (admin-selectable, two-color combinations)            */
  /* ---------------------------------------------------------------- */
  const STORE_THEMES = ['lavender', 'sunset', 'rose', 'plum', 'sage', 'custom'];

  /* Hex color helpers for the custom theme: a full palette is derived
     from the owner's two picked colors (primary + secondary). */
  function hexToRgb(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Mix a hex color toward another hex color (0 = keep, 1 = target).
  function mixHex(hex, target, ratio) {
    const a = hexToRgb(hex);
    const b = hexToRgb(target);
    if (!a || !b) return hex;
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * ratio));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : hex;
  }
  // Relative luminance (0 = black, 1 = white) — decides whether button
  // text on a custom-theme color should be white or dark.
  function luminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const lin = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  // Inline variables set by the custom theme, so they can be cleared
  // when the owner switches back to a preset theme.
  const CUSTOM_VARS = [
    '--color-primary', '--color-primary-deep', '--color-primary-soft', '--color-primary-pale',
    '--color-sage', '--color-sage-deep', '--color-sage-pale',
    '--color-accent', '--color-accent-deep', '--color-accent-pale',
    '--color-blush', '--color-blush-pale', '--shadow-glow',
    '--color-btn-primary-end', '--color-btn-accent-end',
    '--color-on-primary', '--color-on-accent',
  ];
  function clearCustomVars() {
    CUSTOM_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  }
  function applyCustomTheme(custom) {
    const primary = hexToRgb(custom && custom.primary) ? custom.primary : '#4a2145';
    const secondary = hexToRgb(custom && custom.secondary) ? custom.secondary : '#c9a24b';
    const vars = {
      '--color-primary': primary,
      '--color-primary-deep': mixHex(primary, '#000000', 0.35),
      '--color-primary-soft': mixHex(primary, '#ffffff', 0.55),
      '--color-primary-pale': mixHex(primary, '#ffffff', 0.88),
      '--color-sage': secondary,
      '--color-sage-deep': mixHex(secondary, '#000000', 0.3),
      '--color-sage-pale': mixHex(secondary, '#ffffff', 0.85),
      '--color-accent': secondary,
      '--color-accent-deep': mixHex(secondary, '#000000', 0.3),
      '--color-accent-pale': mixHex(secondary, '#ffffff', 0.85),
      '--color-blush': mixHex(primary, '#ffffff', 0.7),
      '--color-blush-pale': mixHex(primary, '#ffffff', 0.92),
      '--shadow-glow': `0 20px 55px ${rgba(primary, 0.35)}`,
      '--color-btn-primary-end': mixHex(primary, '#000000', 0.45),
      '--color-btn-accent-end': mixHex(secondary, '#000000', 0.45),
      // Light picked color => dark button text, so the button label
      // stays readable no matter which two colors he chooses.
      '--color-on-primary': luminance(primary) > 0.5 ? '#241031' : '#fff',
      '--color-on-accent': luminance(secondary) > 0.5 ? '#241031' : '#fff',
    };
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }

  function applyTheme(theme, customTheme) {
    const t = STORE_THEMES.includes(theme) ? theme : 'lavender';
    document.documentElement.setAttribute('data-store-theme', t);
    clearCustomVars();
    // The custom theme has no CSS block of its own — its palette is
    // derived from the two picked colors and set as inline variables
    // (backgrounds and text are left alone, so dark mode still works).
    if (t === 'custom') applyCustomTheme(customTheme);
  }

  /* Category tint shown behind a product image only if that image
     fails to load — the glow itself always comes from the image. */
  const CATEGORY_GLOW = {
    Lipstick: 'linear-gradient(135deg, #e8a0a0, #c96a8b)',
    Skincare: 'linear-gradient(135deg, #a8c5a0, #7fa377)',
    Face: 'linear-gradient(135deg, #f2c4b3, #e8a87c)',
    Mascara: 'linear-gradient(135deg, #b8a9e0, #7d4a7a)',
    Blush: 'linear-gradient(135deg, #f2c4b3, #e8a0a0)',
  };
  const DEFAULT_GLOW = 'linear-gradient(135deg, #b8a9e0, #f6e3d7)';
  function glowFallback(category) {
    return CATEGORY_GLOW[category] || DEFAULT_GLOW;
  }

  /* ---------------------------------------------------------------- */
  /* Social icons — the REAL brand marks in the REAL brand colors.     */
  /* Facebook: blue #1877F2 "f" · Instagram: official gradient tile    */
  /* with a white camera · TikTok: black note with cyan #25F4EE and    */
  /* pink #FE2C55 offset shadows · YouTube: red #FF0000 play button.   */
  /* ---------------------------------------------------------------- */
  const SOCIAL_ICONS = {
    facebook:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V11H8v3h2.5v7h3z"/></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#FE2C55"><path d="M16.6 3c.4 2.2 1.8 3.7 4.1 3.9v3c-1.6 0-3-.5-4.1-1.3v6.3c0 3.4-2.6 6.1-5.9 6.1A5.7 5.7 0 0 1 5 15.3c0-3.2 2.6-5.8 5.8-5.8.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.2-1-.2-1.5 0-2.7 1.2-2.7 2.8 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.3 2.8-2.9V3h3z" transform="translate(-0.9 0)"/></g><g fill="#25F4EE"><path d="M16.6 3c.4 2.2 1.8 3.7 4.1 3.9v3c-1.6 0-3-.5-4.1-1.3v6.3c0 3.4-2.6 6.1-5.9 6.1A5.7 5.7 0 0 1 5 15.3c0-3.2 2.6-5.8 5.8-5.8.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.2-1-.2-1.5 0-2.7 1.2-2.7 2.8 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.3 2.8-2.9V3h3z" transform="translate(0.9 0)"/></g><path fill="#000000" d="M16.6 3c.4 2.2 1.8 3.7 4.1 3.9v3c-1.6 0-3-.5-4.1-1.3v6.3c0 3.4-2.6 6.1-5.9 6.1A5.7 5.7 0 0 1 5 15.3c0-3.2 2.6-5.8 5.8-5.8.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.2-1-.2-1.5 0-2.7 1.2-2.7 2.8 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.3 2.8-2.9V3h3z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="igGrad-UID" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset="0.35" stop-color="#fa7e1e"/><stop offset="0.6" stop-color="#d62976"/><stop offset="0.8" stop-color="#962fbf"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#igGrad-UID)"/><rect x="4.6" y="4.6" width="14.8" height="14.8" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.1" cy="6.9" r="1.3" fill="#fff"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.6" y="5" width="20.8" height="14" rx="4" fill="#FF0000"/><path d="M10.2 9.3v5.4l4.9-2.7z" fill="#fff"/></svg>',
  };

  const SOCIAL_LABELS = {
    facebook: 'Facebook',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube Shorts',
  };

  function renderSocialIcons(container, uid) {
    if (!container || !settings) return;
    const social = settings.social || {};
    container.innerHTML = Object.keys(SOCIAL_ICONS).map((key) => {
      const url = safeUrl(social[key] || '');
      const label = SOCIAL_LABELS[key];
      const icon = SOCIAL_ICONS[key].split('UID').join(uid || 'x');
      if (url) {
        return `<a class="social-icon" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)">${icon}</a>`;
      }
      return `<span class="social-icon disabled" aria-label="${label} — link not set yet" title="${label} — link not set yet">${icon}</span>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Render: settings-driven content                                   */
  /* ---------------------------------------------------------------- */
  function applySettings() {
    if (!settings) return;
    document.title = `${settings.store_name || 'Demi Somi Finds'} — Beauty Finds You'll Love`;
    applyTheme(settings.theme, settings.custom_theme);
    $('#heroHeadline').textContent = settings.hero_headline || 'Beauty finds that feel made for you.';
    $('#heroSubheadline').textContent = settings.hero_subheadline || '';
    $('#heroTagline').textContent = settings.tagline || '';
    $('#aboutText').textContent = settings.about_text || '';
    $('#copyrightName').textContent = settings.store_name || 'Demi Somi Finds';
    $('#footerTagline').textContent = settings.tagline || '';

    const bar = $('#announcementBar');
    if (settings.announcement_enabled && settings.announcement_text) {
      $('#announcementText').textContent = settings.announcement_text;
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }

    const email = (settings.contact_email || '').trim();
    const emailEl = $('#contactEmail');
    if (email) {
      emailEl.textContent = email;
      emailEl.href = 'mailto:' + email;
    } else {
      emailEl.textContent = '';
      emailEl.removeAttribute('href');
    }

    const disclosure = $('#disclosureLine');
    if (settings.disclosure_enabled && settings.disclosure_text) {
      disclosure.textContent = settings.disclosure_text;
      disclosure.hidden = false;
    } else {
      disclosure.hidden = true;
    }

    // Why-choose-us cards come from the editable trust badges.
    const badges = Array.isArray(settings.trust_badges) ? settings.trust_badges.filter(Boolean) : [];
    const whyIcons = ['✦', '♡', '↺'];
    const whyCopy = {
      'Cruelty-free finds': 'Kind choices, always. We look for products made without animal testing.',
      'Secure checkout': 'Shop with confidence. Your purchase happens on the retailer’s secure checkout.',
      'Easy returns': 'Changed your mind? The retailer’s return policy has you covered.',
    };
    const whyGrid = $('#whyGrid');
    whyGrid.innerHTML = badges.slice(0, 3).map((badge, i) => `
      <article class="why-card reveal">
        <div class="why-icon" aria-hidden="true">${whyIcons[i % whyIcons.length]}</div>
        <h3>${escapeHtml(badge)}</h3>
        <p>${escapeHtml(whyCopy[badge] || 'A little detail that makes shopping here feel good.')}</p>
      </article>`).join('');

    renderSocialIcons($('#footerSocial'), 'footer');
    renderSocialIcons($('#contactSocial'), 'contact');
    observeReveals();
  }

  /* ---------------------------------------------------------------- */
  /* Render: products                                                  */
  /* ---------------------------------------------------------------- */
  const grid = $('#productsGrid');
  const noResults = $('#noResults');

  function productImage(product) {
    const first = product.images && product.images[0];
    return first || '';
  }

  function filteredProducts() {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== 'All' && p.category !== activeCategory) return false;
      if (!q) return true;
      return [p.name, p.title, p.description, p.category]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }

  function renderChips() {
    const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
    $('#categoryChips').innerHTML = categories.map((cat) => `
      <button type="button" class="chip ${cat === activeCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
    `).join('');
    $$('#categoryChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.category;
        renderChips();
        renderProducts();
      });
    });
  }

  function renderProducts() {
    const list = filteredProducts();
    noResults.hidden = list.length !== 0;
    grid.innerHTML = list.map((p, i) => `
      <article class="product-card reveal" data-id="${p.id}" style="--reveal-delay:${Math.min(i, 8) * 70}ms" tabindex="0">
        <div class="card-media">
          <div class="card-glow" style="--glow-fallback:${glowFallback(p.category)}" aria-hidden="true">
            <img src="${escapeHtml(productImage(p))}" alt="" loading="lazy" decoding="async">
          </div>
          <img src="${escapeHtml(productImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
        </div>
        <div class="card-body">
          <span class="badge">${escapeHtml(p.category)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          ${p.title ? `<p class="card-title">${escapeHtml(p.title)}</p>` : ''}
          <p class="card-desc">${escapeHtml(p.description)}</p>
          <div class="card-foot">
            <span class="price">${escapeHtml(formatPrice(p.price))}</span>
            <button type="button" class="btn btn-primary" data-view="${p.id}">View Details</button>
          </div>
        </div>
      </article>`).join('');

    // If a glow copy fails to load, hide it so the category tint behind
    // it shows instead (same image as the card photo, so this is rare).
    $$('.card-glow img', grid).forEach((img) => {
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    });
    $$('.product-card', grid).forEach((card) => {
      const id = Number(card.dataset.id);
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // button handles it
        openModal(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openModal(id);
      });
      // Touch tap-highlight equivalent (lift only — never dims others).
      if (isTouch) {
        card.addEventListener('click', () => {
          const wasActive = card.classList.contains('is-active');
          $$('.product-card.is-active', grid).forEach((c) => c.classList.remove('is-active'));
          if (!wasActive) {
            card.classList.add('is-active');
          }
        });
      }
    });
    $$('[data-view]', grid).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(Number(btn.dataset.view));
      });
    });
    observeReveals();
  }

  /* ---------------------------------------------------------------- */
  /* Product modal                                                     */
  /* ---------------------------------------------------------------- */
  const modal = $('#productModal');
  let lastFocused = null;

  function openModal(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    lastFocused = document.activeElement;
    const imgSrc = productImage(p);
    $('#modalImage').src = imgSrc;
    $('#modalImage').alt = p.name;
    const glowImg = $('#modalGlowImage');
    glowImg.style.display = '';
    glowImg.src = imgSrc;
    $('.modal-glow').style.setProperty('--glow-fallback', glowFallback(p.category));
    $('#modalCategory').textContent = p.category;
    $('#modalName').textContent = p.name;
    $('#modalTitle').textContent = p.title || '';
    $('#modalPrice').textContent = formatPrice(p.price);
    $('#modalDescription').textContent = p.description || '';

    const buyBtn = $('#modalBuyBtn');
    const contactBtn = $('#modalContactBtn');
    const note = $('.modal-note');
    const buyLink = safeUrl(p.buy_link || '');
    if (buyLink) {
      buyBtn.href = buyLink;
      buyBtn.hidden = false;
      contactBtn.hidden = true;
      note.hidden = false;
    } else {
      buyBtn.hidden = true;
      contactBtn.hidden = false;
      note.hidden = true;
      contactBtn.addEventListener('click', closeModal, { once: true });
    }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal-close', modal).focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
  $('#modalGlowImage').addEventListener('error', () => {
    $('#modalGlowImage').style.display = 'none';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ---------------------------------------------------------------- */
  /* Search + toolbar                                                  */
  /* ---------------------------------------------------------------- */
  $('#searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderProducts();
  });

  /* ---------------------------------------------------------------- */
  /* Scroll reveals (IntersectionObserver, staggered)                  */
  /* ---------------------------------------------------------------- */
  let revealObserver = null;
  function observeReveals() {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    $$('.reveal:not(.is-visible)').forEach((el) => revealObserver.observe(el));
  }

  /* ---------------------------------------------------------------- */
  /* Header, progress, mobile menu                                     */
  /* ---------------------------------------------------------------- */
  const header = $('#siteHeader');
  const progress = $('#scrollProgress');
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      header.classList.toggle('scrolled', y > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
      // Hero parallax (transform + opacity only).
      if (!reducedMotion) {
        const hero = $('#hero');
        if (hero) {
          const offset = Math.min(y, hero.offsetHeight);
          $$('.float-el', hero).forEach((el) => {
            const depth = Number(el.dataset.depth || 12);
            el.style.translate = `0 ${offset * depth * 0.012}px`;
          });
        }
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menuToggle = $('#menuToggle');
  const mobileNav = $('#mobileNav');
  menuToggle.addEventListener('click', () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  $$('#mobileNav a').forEach((a) => a.addEventListener('click', () => {
    mobileNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }));

  /* ---------------------------------------------------------------- */
  /* Hero background motion: scroll parallax (in onScroll above) plus  */
  /* mouse drift — the floating beauty visuals shift subtly as the     */
  /* mouse moves. Transform/opacity only, no custom cursor involved,   */
  /* and disabled when the user prefers reduced motion.                */
  /* ---------------------------------------------------------------- */
  const heroEl = $('#hero');
  if (heroEl && finePointer && !reducedMotion) {
    heroEl.addEventListener('mousemove', (e) => {
      const rect = heroEl.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      $$('.float-el', heroEl).forEach((el) => {
        const depth = Number(el.dataset.depth || 12);
        el.style.marginLeft = `${nx * depth * 0.6}px`;
        el.style.marginTop = `${ny * depth * 0.6}px`;
      });
    });
    heroEl.addEventListener('mouseleave', () => {
      $$('.float-el', heroEl).forEach((el) => {
        el.style.marginLeft = '';
        el.style.marginTop = '';
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Dark mode                                                         */
  /* ---------------------------------------------------------------- */
  const themeToggle = $('#themeToggle');
  const savedTheme = localStorage.getItem('dsf-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('dsf-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('dsf-theme', 'dark');
    }
  });

  /* ---------------------------------------------------------------- */
  /* Cookie banner                                                     */
  /* ---------------------------------------------------------------- */
  const cookieBanner = $('#cookieBanner');
  if (!localStorage.getItem('dsf-cookie-ok')) cookieBanner.hidden = false;
  $('#cookieAccept').addEventListener('click', () => {
    localStorage.setItem('dsf-cookie-ok', '1');
    cookieBanner.hidden = true;
  });

  /* ---------------------------------------------------------------- */
  /* Intro overlay (skippable, < 2s)                                  */
  /* ---------------------------------------------------------------- */
  const intro = $('#intro');
  function dismissIntro() {
    intro.classList.add('done');
    setTimeout(() => intro.remove(), 700);
  }
  if (reducedMotion) {
    dismissIntro();
  } else {
    setTimeout(dismissIntro, 1400);
    intro.addEventListener('click', dismissIntro);
    document.addEventListener('keydown', dismissIntro, { once: true });
  }

  /* ---------------------------------------------------------------- */
  /* Load data                                                         */
  /* ---------------------------------------------------------------- */
  $('#year').textContent = new Date().getFullYear();

  Promise.all([
    fetchJson('/api/settings').catch(() => null),
    fetchJson('/api/products').catch(() => []),
  ]).then(([s, p]) => {
    settings = s || {};
    products = Array.isArray(p) ? p : [];
    applySettings();
    renderChips();
    renderProducts();
    observeReveals();
  }).catch(() => {
    grid.innerHTML = '<p class="no-results">We could not load products right now. Please refresh the page.</p>';
  });
})();
