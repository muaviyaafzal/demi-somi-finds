/**
 * store.js — Demi Somi Finds public storefront.
 * All product data comes from the API (never hardcoded in HTML).
 * Motion: IntersectionObserver reveals, hero parallax, custom cursor,
 * magnetic buttons, scroll progress, product hover highlight (CSS) with
 * a tap equivalent for touch. Respects prefers-reduced-motion.
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
  /* Social icons (inline SVG)                                         */
  /* ---------------------------------------------------------------- */
  const SOCIAL_ICONS = {
    facebook:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V11H8v3h2.5v7h3z"/></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.8 3.7 4.1 3.9v3c-1.6 0-3-.5-4.1-1.3v6.3c0 3.4-2.6 6.1-5.9 6.1A5.7 5.7 0 0 1 5 15.3c0-3.2 2.6-5.8 5.8-5.8.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.2-1-.2-1.5 0-2.7 1.2-2.7 2.8 0 1.5 1.2 2.7 2.7 2.7 1.6 0 2.8-1.3 2.8-2.9V3h3z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1s-3.6 0-4.9-.1c-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8C2.3 4 3.9 2.4 7.1 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 3.6a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.5a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.6 1 1.9.2 7.5.3 7.5.3s4.6 0 7.7-.4c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.8 15.1V8.4l6.2 3.4-6.2 3.3z"/></svg>',
  };

  const SOCIAL_LABELS = {
    facebook: 'Facebook',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube Shorts',
  };

  function renderSocialIcons(container, size) {
    if (!container || !settings) return;
    const social = settings.social || {};
    container.innerHTML = Object.keys(SOCIAL_ICONS).map((key) => {
      const url = safeUrl(social[key] || '');
      const label = SOCIAL_LABELS[key];
      if (url) {
        return `<a class="social-icon" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)" data-cursor>${SOCIAL_ICONS[key]}</a>`;
      }
      return `<span class="social-icon disabled" aria-label="${label} — link not set yet" title="${label} — link not set yet">${SOCIAL_ICONS[key]}</span>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- */
  /* Render: settings-driven content                                   */
  /* ---------------------------------------------------------------- */
  function applySettings() {
    if (!settings) return;
    document.title = `${settings.store_name || 'Demi Somi Finds'} — Beauty Finds You'll Love`;
    $('#brandName').textContent = settings.store_name || 'Demi Somi Finds';
    $('#heroHeadline').textContent = settings.hero_headline || 'Beauty finds that feel made for you.';
    $('#heroSubheadline').textContent = settings.hero_subheadline || '';
    $('#heroTagline').textContent = settings.tagline || '';
    $('#aboutText').textContent = settings.about_text || '';
    $('#footerName').textContent = settings.store_name || 'Demi Somi Finds';
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

    renderSocialIcons($('#footerSocial'));
    renderSocialIcons($('#contactSocial'));
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
      <button type="button" class="chip ${cat === activeCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}" data-cursor>${escapeHtml(cat)}</button>
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
      <article class="product-card reveal" data-id="${p.id}" style="--reveal-delay:${Math.min(i, 8) * 70}ms" tabindex="0" data-cursor-view>
        <div class="card-media">
          <img src="${escapeHtml(productImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
        </div>
        <div class="card-body">
          <span class="badge">${escapeHtml(p.category)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          ${p.title ? `<p class="card-title">${escapeHtml(p.title)}</p>` : ''}
          <p class="card-desc">${escapeHtml(p.description)}</p>
          <div class="card-foot">
            <span class="price">${escapeHtml(formatPrice(p.price))}</span>
            <button type="button" class="btn btn-primary" data-view="${p.id}" data-cursor>View Details</button>
          </div>
        </div>
      </article>`).join('');

    $$('.product-card', grid).forEach((card) => {
      const id = Number(card.dataset.id);
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // button handles it
        openModal(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openModal(id);
      });
      // Touch tap-highlight equivalent.
      if (isTouch) {
        card.addEventListener('click', () => {
          const wasActive = card.classList.contains('is-active');
          $$('.product-card.is-active', grid).forEach((c) => c.classList.remove('is-active'));
          grid.classList.remove('has-active');
          if (!wasActive) {
            card.classList.add('is-active');
            grid.classList.add('has-active');
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
    $('#modalImage').src = productImage(p);
    $('#modalImage').alt = p.name;
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
  /* Custom cursor + magnetic buttons (desktop, fine pointer only)     */
  /* ---------------------------------------------------------------- */
  if (finePointer && !reducedMotion) {
    document.body.classList.add('has-cursor');
    const dot = $('#cursorDot');
    const ring = $('#cursorRing');
    const label = $('#cursorLabel');
    let mx = -100, my = -100, rx = -100, ry = -100;
    let rafId = null;

    function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      rafId = requestAnimationFrame(loop);
    }
    document.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (rafId === null) loop();
    }, { passive: true });

    document.addEventListener('mouseover', (e) => {
      const viewTarget = e.target.closest('[data-cursor-view]');
      const interactive = e.target.closest('a, button, input, textarea, select, [data-cursor]');
      if (viewTarget) {
        ring.classList.add('is-view');
        ring.classList.remove('is-hover');
        label.textContent = 'View';
      } else if (interactive) {
        ring.classList.add('is-hover');
        ring.classList.remove('is-view');
        label.textContent = '';
      } else {
        ring.classList.remove('is-hover', 'is-view');
        label.textContent = '';
      }
    });

    // Magnetic buttons: gently pull toward the cursor.
    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        btn.style.transform = `translate(${dx * 0.12}px, ${dy * 0.18}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });

    // Cursor-reactive hero: floating shapes drift with the mouse.
    const hero = $('#hero');
    if (hero) {
      hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        $$('.float-el', hero).forEach((el) => {
          const depth = Number(el.dataset.depth || 12);
          el.style.marginLeft = `${nx * depth * 0.6}px`;
          el.style.marginTop = `${ny * depth * 0.6}px`;
        });
      });
      hero.addEventListener('mouseleave', () => {
        $$('.float-el', hero).forEach((el) => {
          el.style.marginLeft = '';
          el.style.marginTop = '';
        });
      });
    }
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
