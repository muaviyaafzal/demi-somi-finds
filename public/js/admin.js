/**
 * admin.js — Demi Somi Finds admin panel.
 * Login -> forced credential change (first login) -> dashboard.
 * Products CRUD + drag reorder, image uploads, social links, settings,
 * legal pages, account. All data is stored in SQLite via the API.
 */
'use strict';

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const TOKEN_KEY = 'dsf-admin-token';
  const USER_KEY = 'dsf-admin-username';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearToken();
      showView('login');
      throw new Error(data.error || 'Session expired. Please sign in again.');
    }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  async function apiForm(path, formData) {
    const res = await fetch(path, {
      method: 'POST',
      headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearToken();
      showView('login');
      throw new Error(data.error || 'Session expired. Please sign in again.');
    }
    if (!res.ok) throw new Error(data.error || ('Upload failed (' + res.status + ')'));
    return data;
  }

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */
  function toast(message, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }
  function hideError(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  function setLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Working…';
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Views                                                             */
  /* ---------------------------------------------------------------- */
  const views = {
    login: $('#loginView'),
    change: $('#changeView'),
    dashboard: $('#dashboardView'),
  };
  function showView(name) {
    Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
    window.scrollTo({ top: 0 });
  }

  /* ---------------------------------------------------------------- */
  /* Password strength                                                 */
  /* ---------------------------------------------------------------- */
  function passwordScore(pw) {
    let score = 0;
    if (pw.length >= 10) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0-4
  }
  function attachStrengthMeter(input, bar, label) {
    if (!input || !bar) return;
    input.addEventListener('input', () => {
      const pw = input.value;
      const score = passwordScore(pw);
      bar.className = 'strength-bar' + (score <= 1 ? ' weak' : score === 2 ? ' fair' : score === 3 ? ' good' : ' strong');
      if (label) {
        label.textContent = pw === '' ? 'At least 10 characters, with upper + lowercase, a number and a special character.'
          : score <= 1 ? 'Weak — add length, mixed case, a number and a special character.'
          : score === 2 ? 'Fair — almost there, add more variety.'
          : score === 3 ? 'Good password.'
          : 'Strong password.';
      }
    });
  }
  attachStrengthMeter($('#newPassword'), $('#strengthBar'), $('#strengthLabel'));
  attachStrengthMeter($('#accountNewPassword'), $('#accountStrengthBar'), $('#accountStrengthLabel'));

  function validatePassword(pw) {
    if (pw.length < 10) return 'Password must be at least 10 characters long.';
    if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
    if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must include a number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a special character.';
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Login + forced credential change                                  */
  /* ---------------------------------------------------------------- */
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#loginError'));
    const btn = $('#loginBtn');
    setLoading(btn, true, 'Signing in…');
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('#loginUsername').value.trim(),
          password: $('#loginPassword').value,
        }),
      });
      setToken(data.token);
      localStorage.setItem(USER_KEY, data.username);
      if (data.mustChangeCredentials) {
        showView('change');
        toast('Welcome! Please create your own credentials first.');
      } else {
        await enterDashboard();
      }
    } catch (err) {
      showError($('#loginError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#changeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#changeError'));
    const username = $('#newUsername').value.trim();
    const password = $('#newPassword').value;
    const confirm = $('#confirmPassword').value;
    if (!/^[A-Za-z0-9._-]+$/.test(username) || username.length > 60) {
      return showError($('#changeError'), 'Username must be 1–60 characters: letters, numbers, dot, underscore or hyphen.');
    }
    const pwError = validatePassword(password);
    if (pwError) return showError($('#changeError'), pwError);
    if (password !== confirm) return showError($('#changeError'), 'Passwords do not match.');
    const btn = $('#changeBtn');
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api('/api/admin/change-credentials', {
        method: 'POST',
        body: JSON.stringify({ newUsername: username, newPassword: password }),
      });
      setToken(data.token);
      localStorage.setItem(USER_KEY, data.username);
      toast('Your credentials are saved. The demo login no longer works.');
      await enterDashboard();
    } catch (err) {
      showError($('#changeError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    clearToken();
    showView('login');
    toast('Signed out.');
  });

  /* ---------------------------------------------------------------- */
  /* Dashboard                                                         */
  /* ---------------------------------------------------------------- */
  let products = [];
  let settings = {};
  let formImages = [];

  async function enterDashboard() {
    $('#adminUserLabel').textContent = localStorage.getItem(USER_KEY) || '';
    $('#accountUsername').textContent = localStorage.getItem(USER_KEY) || '';
    showView('dashboard');
    showTab('products');
    await Promise.all([loadProducts(), loadSettings()]);
  }

  function showTab(name) {
    $$('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    ['products', 'productForm', 'social', 'settings', 'legal', 'account'].forEach((tab) => {
      const panel = $('#tab-' + tab);
      if (panel) panel.hidden = tab !== name;
    });
  }
  $$('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'productForm') resetProductForm();
      showTab(tab.dataset.tab);
    });
  });

  /* ---------------- Products list ---------------- */
  async function loadProducts() {
    try {
      products = await api('/api/admin/products');
      renderProductList();
      renderCategoryDatalist();
    } catch (err) {
      toast(err.message, true);
    }
  }

  function renderCategoryDatalist() {
    const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];
    $('#categoryList').innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  }

  function renderProductList() {
    const list = $('#productList');
    $('#productEmpty').hidden = products.length !== 0;
    list.innerHTML = products.map((p) => {
      const img = p.images && p.images[0] ? p.images[0] : '';
      return `
      <div class="product-row" draggable="true" data-id="${p.id}">
        <span class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
        <img class="product-thumb" src="${escapeHtml(img)}" alt="" loading="lazy">
        <div class="product-info">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.category)} · ${p.visible ? 'Visible' : 'Hidden'}</span>
        </div>
        <span class="product-price">$${Number(p.price).toFixed(2)}</span>
        <div class="product-actions">
          <button type="button" class="mini-btn" data-edit="${p.id}">Edit</button>
          <button type="button" class="mini-btn danger" data-delete="${p.id}">Delete</button>
        </div>
      </div>`;
    }).join('');

    $$('[data-edit]', list).forEach((btn) => btn.addEventListener('click', () => editProduct(Number(btn.dataset.edit))));
    $$('[data-delete]', list).forEach((btn) => btn.addEventListener('click', () => askDelete(Number(btn.dataset.delete))));

    // Drag & drop reorder.
    let draggedId = null;
    $$('.product-row', list).forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        draggedId = Number(row.dataset.id);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        $$('.drag-over', list).forEach((r) => r.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const targetId = Number(row.dataset.id);
        if (draggedId === null || draggedId === targetId) return;
        const from = products.findIndex((p) => p.id === draggedId);
        const to = products.findIndex((p) => p.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = products.splice(from, 1);
        products.splice(to, 0, moved);
        renderProductList();
        try {
          await api('/api/admin/products/reorder', {
            method: 'POST',
            body: JSON.stringify({ order: products.map((p) => p.id) }),
          });
          toast('Order saved.');
        } catch (err) {
          toast(err.message, true);
          await loadProducts();
        }
      });
    });
  }

  /* ---------------- Product form ---------------- */
  function resetProductForm() {
    $('#productFormTitle').textContent = 'Add Product';
    $('#productId').value = '';
    $('#pName').value = '';
    $('#pTitle').value = '';
    $('#pPrice').value = '';
    $('#pCategory').value = '';
    $('#pDescription').value = '';
    $('#pBuyLink').value = '';
    $('#pVisible').checked = true;
    formImages = [];
    renderImagePreviews();
    hideError($('#productError'));
  }

  function editProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    $('#productFormTitle').textContent = 'Edit Product';
    $('#productId').value = String(p.id);
    $('#pName').value = p.name;
    $('#pTitle').value = p.title || '';
    $('#pPrice').value = String(p.price);
    $('#pCategory').value = p.category;
    $('#pDescription').value = p.description || '';
    $('#pBuyLink').value = p.buy_link || '';
    $('#pVisible').checked = !!p.visible;
    formImages = Array.isArray(p.images) ? [...p.images] : [];
    renderImagePreviews();
    hideError($('#productError'));
    showTab('productForm');
  }

  function renderImagePreviews() {
    const wrap = $('#imagePreviews');
    wrap.innerHTML = formImages.map((url, i) => `
      <div class="image-preview">
        <img src="${escapeHtml(url)}" alt="Product image ${i + 1}">
        ${i === 0 ? '<span class="main-tag">Main</span>' : ''}
        <button type="button" data-remove-img="${i}" aria-label="Remove image ${i + 1}">✕</button>
      </div>`).join('');
    $$('[data-remove-img]', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        formImages.splice(Number(btn.dataset.removeImg), 1);
        renderImagePreviews();
      });
    });
  }

  $('#imageUpload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('image', file);
        const data = await apiForm('/api/admin/upload', fd);
        formImages.push(data.url);
        toast('Image uploaded.');
      } catch (err) {
        toast(err.message, true);
      }
    }
    e.target.value = '';
    renderImagePreviews();
  });

  $('#addImageUrlBtn').addEventListener('click', () => {
    const input = $('#imageUrlInput');
    const url = input.value.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:' && !url.startsWith('data:image/')) {
        throw new Error('bad');
      }
    } catch {
      return toast('Please paste a full http(s) image URL.', true);
    }
    if (formImages.length >= 6) return toast('At most 6 images per product.', true);
    formImages.push(url);
    input.value = '';
    renderImagePreviews();
  });

  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#productError'));
    const id = $('#productId').value;
    const payload = {
      name: $('#pName').value.trim(),
      title: $('#pTitle').value.trim(),
      description: $('#pDescription').value.trim(),
      price: Number($('#pPrice').value),
      category: $('#pCategory').value.trim(),
      buy_link: $('#pBuyLink').value.trim(),
      images: formImages,
      visible: $('#pVisible').checked,
    };
    if (!payload.name) return showError($('#productError'), 'Product name is required.');
    if (Number.isNaN(payload.price) || payload.price < 0) return showError($('#productError'), 'Price must be a number of 0 or more.');
    if (!payload.category) return showError($('#productError'), 'Category is required.');
    const btn = $('#productSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      if (id) {
        await api('/api/admin/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Product updated.');
      } else {
        await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
        toast('Product added.');
      }
      resetProductForm();
      await loadProducts();
      showTab('products');
    } catch (err) {
      showError($('#productError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#productCancelBtn').addEventListener('click', () => {
    resetProductForm();
    showTab('products');
  });
  $('#addProductBtn').addEventListener('click', () => {
    resetProductForm();
    showTab('productForm');
  });

  /* ---------------- Delete confirm ---------------- */
  let pendingDeleteId = null;
  function askDelete(id) {
    const p = products.find((x) => x.id === id);
    pendingDeleteId = id;
    $('#confirmText').textContent = p
      ? `Delete “${p.name}”? This cannot be undone.`
      : 'Delete this product? This cannot be undone.';
    $('#confirmModal').hidden = false;
  }
  function closeConfirm() {
    pendingDeleteId = null;
    $('#confirmModal').hidden = true;
  }
  $$('[data-confirm-cancel]').forEach((el) => el.addEventListener('click', closeConfirm));
  $('#confirmDeleteBtn').addEventListener('click', async () => {
    if (pendingDeleteId === null) return;
    const btn = $('#confirmDeleteBtn');
    setLoading(btn, true, 'Deleting…');
    try {
      await api('/api/admin/products/' + pendingDeleteId, { method: 'DELETE' });
      toast('Product deleted.');
      closeConfirm();
      await loadProducts();
    } catch (err) {
      toast(err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---------------- Settings ---------------- */
  async function loadSettings() {
    try {
      settings = await api('/api/admin/settings');
      $('#setStoreName').value = settings.store_name || '';
      $('#setCurrency').value = settings.currency || '$';
      $('#setTagline').value = settings.tagline || '';
      $('#setHeroHeadline').value = settings.hero_headline || '';
      $('#setHeroSub').value = settings.hero_subheadline || '';
      $('#setAnnouncement').value = settings.announcement_text || '';
      $('#setAnnouncementEnabled').checked = settings.announcement_enabled === '1';
      $('#setAbout').value = settings.about_text || '';
      $('#setContactEmail').value = settings.contact_email || '';
      const badges = Array.isArray(settings.trust_badges) ? settings.trust_badges : [];
      $('#setBadge1').value = badges[0] || '';
      $('#setBadge2').value = badges[1] || '';
      $('#setBadge3').value = badges[2] || '';
      $('#setDisclosure').value = settings.disclosure_text || '';
      $('#setDisclosureEnabled').checked = settings.disclosure_enabled === '1';
      $('#sFacebook').value = settings.social_facebook || '';
      $('#sTikTok').value = settings.social_tiktok || '';
      $('#sInstagram').value = settings.social_instagram || '';
      $('#sYoutube').value = settings.social_youtube || '';
      $('#legalPrivacy').value = settings.legal_privacy || '';
      $('#legalTerms').value = settings.legal_terms || '';
      $('#legalShipping').value = settings.legal_shipping || '';
    } catch (err) {
      toast(err.message, true);
    }
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#settingsError'));
    const badges = [$('#setBadge1').value.trim(), $('#setBadge2').value.trim(), $('#setBadge3').value.trim()].filter(Boolean);
    const payload = {
      store_name: $('#setStoreName').value.trim(),
      currency: $('#setCurrency').value.trim() || '$',
      tagline: $('#setTagline').value.trim(),
      hero_headline: $('#setHeroHeadline').value.trim(),
      hero_subheadline: $('#setHeroSub').value.trim(),
      announcement_text: $('#setAnnouncement').value.trim(),
      announcement_enabled: $('#setAnnouncementEnabled').checked ? '1' : '0',
      about_text: $('#setAbout').value.trim(),
      contact_email: $('#setContactEmail').value.trim(),
      trust_badges: badges,
      disclosure_text: $('#setDisclosure').value.trim(),
      disclosure_enabled: $('#setDisclosureEnabled').checked ? '1' : '0',
    };
    const btn = $('#settingsSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Settings saved — the store is updated.');
    } catch (err) {
      showError($('#settingsError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#socialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#socialError'));
    const payload = {
      social_facebook: $('#sFacebook').value.trim(),
      social_tiktok: $('#sTikTok').value.trim(),
      social_instagram: $('#sInstagram').value.trim(),
      social_youtube: $('#sYoutube').value.trim(),
    };
    const btn = $('#socialSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Social links saved — the store footer is updated.');
    } catch (err) {
      showError($('#socialError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#legalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#legalError'));
    const payload = {
      legal_privacy: $('#legalPrivacy').value,
      legal_terms: $('#legalTerms').value,
      legal_shipping: $('#legalShipping').value,
    };
    const btn = $('#legalSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Legal pages saved.');
    } catch (err) {
      showError($('#legalError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---------------- Account ---------------- */
  $('#usernameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#usernameError'));
    const newUsername = $('#accountNewUsername').value.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(newUsername) || newUsername.length > 60) {
      return showError($('#usernameError'), 'Username must be 1–60 characters: letters, numbers, dot, underscore or hyphen.');
    }
    const btn = $('#usernameSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api('/api/admin/change-username', {
        method: 'POST',
        body: JSON.stringify({ newUsername }),
      });
      localStorage.setItem(USER_KEY, data.username);
      $('#adminUserLabel').textContent = data.username;
      $('#accountUsername').textContent = data.username;
      $('#accountNewUsername').value = '';
      toast('Username changed.');
    } catch (err) {
      showError($('#usernameError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError($('#passwordError'));
    const currentPassword = $('#currentPassword').value;
    const newPassword = $('#accountNewPassword').value;
    const confirm = $('#accountConfirmPassword').value;
    const pwError = validatePassword(newPassword);
    if (pwError) return showError($('#passwordError'), pwError);
    if (newPassword !== confirm) return showError($('#passwordError'), 'New passwords do not match.');
    const btn = $('#passwordSaveBtn');
    setLoading(btn, true, 'Saving…');
    try {
      await api('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      $('#currentPassword').value = '';
      $('#accountNewPassword').value = '';
      $('#accountConfirmPassword').value = '';
      toast('Password changed.');
    } catch (err) {
      showError($('#passwordError'), err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Boot: restore session if a token exists                           */
  /* ---------------------------------------------------------------- */
  (async function boot() {
    const token = getToken();
    if (!token) {
      showView('login');
      return;
    }
    try {
      const me = await api('/api/admin/me');
      if (me.mustChangeCredentials) {
        showView('change');
      } else {
        await enterDashboard();
      }
    } catch (err) {
      clearToken();
      showView('login');
    }
  })();
})();
