/**
 * Admin Module — 北山好物後台管理
 * 透過 Cloudflare Worker API 管理商品
 */
const Admin = (() => {
  // === Config ===
  // 部署後改為 Cloudflare Worker 的正式 URL
  const API_BASE = localStorage.getItem('beishan_api_url') || 'https://beishan-admin-api.beishan-village.workers.dev';
  const TOKEN_KEY = 'beishan_jwt';
  const MAX_IMAGE_WIDTH = 800;

  let jwt = '';
  let products = [];
  let productsSha = '';
  let editingId = null;
  let pendingImageFile = null;
  let deleteTargetId = null;

  const $ = id => document.getElementById(id);

  // === Init ===
  function init() {
    // Check existing JWT
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      jwt = saved;
      verifyAndEnter();
    }

    // Login events
    $('btn-login').addEventListener('click', handleLogin);
    $('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    $('password-toggle').addEventListener('click', () => {
      const input = $('login-password');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Admin events
    $('btn-logout').addEventListener('click', handleLogout);
    $('btn-add-product').addEventListener('click', () => openProductModal());
    $('modal-close').addEventListener('click', closeProductModal);
    $('modal-cancel').addEventListener('click', closeProductModal);
    $('product-form').addEventListener('submit', handleProductSubmit);
    $('delete-cancel').addEventListener('click', closeDeleteModal);
    $('delete-confirm').addEventListener('click', handleDeleteConfirm);

    // Image upload
    const imagePreview = $('image-preview');
    const imageInput = $('form-image');
    imagePreview.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageSelect);
    imagePreview.addEventListener('dragover', e => { e.preventDefault(); imagePreview.style.borderColor = 'var(--green)'; });
    imagePreview.addEventListener('dragleave', () => { imagePreview.style.borderColor = ''; });
    imagePreview.addEventListener('drop', e => {
      e.preventDefault();
      imagePreview.style.borderColor = '';
      if (e.dataTransfer.files.length) {
        imageInput.files = e.dataTransfer.files;
        handleImageSelect({ target: imageInput });
      }
    });

    // Close modals
    $('product-modal').addEventListener('click', e => { if (e.target === $('product-modal')) closeProductModal(); });
    $('delete-modal').addEventListener('click', e => { if (e.target === $('delete-modal')) closeDeleteModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeProductModal(); closeDeleteModal(); } });
  }

  // === API helper ===
  async function apiFetch(path, options = {}, skipAutoLogout = false) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();

    if (res.status === 401 && !skipAutoLogout && jwt) {
      handleLogout();
      throw new Error('登入已過期，請重新登入');
    }

    if (!res.ok) throw new Error(data.error || '操作失敗');
    return data;
  }

  // === Auth ===
  async function handleLogin() {
    const username = $('login-username').value.trim();
    const password = $('login-password').value.trim();
    const btn = $('btn-login');
    const error = $('login-error');

    if (!username || !password) { error.textContent = '請輸入帳號和密碼'; return; }

    btn.disabled = true;
    btn.querySelector('.btn-login-text').style.display = 'none';
    btn.querySelector('.btn-login-loading').style.display = 'inline';
    error.textContent = '';

    try {
      const data = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }, true);
      jwt = data.token;
      sessionStorage.setItem(TOKEN_KEY, jwt);
      enterAdmin();
    } catch (err) {
      error.textContent = err.message;
      jwt = '';
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-login-text').style.display = 'inline';
      btn.querySelector('.btn-login-loading').style.display = 'none';
    }
  }

  async function verifyAndEnter() {
    try {
      await apiFetch('/api/products');
      enterAdmin();
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      jwt = '';
    }
  }

  function enterAdmin() {
    $('login-screen').style.display = 'none';
    $('admin-panel').style.display = 'block';
    loadProducts();
  }

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    jwt = '';
    $('admin-panel').style.display = 'none';
    $('login-screen').style.display = 'flex';
    $('login-username').value = '';
    $('login-password').value = '';
    $('login-error').textContent = '';
  }

  // === Products ===
  async function loadProducts() {
    $('table-loading').style.display = 'block';
    $('table-empty').style.display = 'none';
    $('products-tbody').innerHTML = '';

    try {
      const data = await apiFetch('/api/products');
      products = data.products;
      productsSha = data.sha;
      renderProducts();
    } catch (err) {
      showToast('❌ ' + err.message);
    } finally {
      $('table-loading').style.display = 'none';
    }
  }

  function renderProducts() {
    const tbody = $('products-tbody');
    if (products.length === 0) {
      tbody.innerHTML = '';
      $('table-empty').style.display = 'block';
    } else {
      $('table-empty').style.display = 'none';
      tbody.innerHTML = products.map(p => `
        <tr data-id="${p.id}">
          <td><img class="table-product-img" src="${p.image}" alt="${p.title}"></td>
          <td class="table-product-title">${p.title}</td>
          <td>${p.description}</td>
          <td class="table-product-price">NT$${p.price.toLocaleString()}</td>
          <td>${p.stock}</td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" title="編輯" onclick="Admin.editProduct(${p.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon danger" title="刪除" onclick="Admin.deleteProduct(${p.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    $('stat-total').textContent = products.length;
    const avg = products.length ? Math.round(products.reduce((s, p) => s + p.price, 0) / products.length) : 0;
    $('stat-avg-price').textContent = `NT$${avg.toLocaleString()}`;
    $('stat-total-stock').textContent = products.reduce((s, p) => s + p.stock, 0);
  }

  // === Product Modal ===
  function openProductModal(product = null) {
    editingId = product ? product.id : null;
    $('modal-title').textContent = product ? '編輯商品' : '新增商品';
    $('form-id').value = product ? product.id : '';
    $('form-title').value = product ? product.title : '';
    $('form-desc').value = product ? product.description : '';
    $('form-price').value = product ? product.price : '';
    $('form-stock').value = product ? product.stock : '';
    pendingImageFile = null;

    const previewImg = $('preview-img');
    const placeholder = $('image-placeholder');
    if (product && product.image) {
      previewImg.src = product.image;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      $('image-preview').classList.add('has-image');
    } else {
      previewImg.style.display = 'none';
      placeholder.style.display = 'block';
      $('image-preview').classList.remove('has-image');
    }

    $('form-image').value = '';
    $('product-modal').style.display = 'flex';
  }

  function closeProductModal() { $('product-modal').style.display = 'none'; pendingImageFile = null; editingId = null; }
  function editProduct(id) { const p = products.find(p => p.id === id); if (p) openProductModal(p); }
  function deleteProduct(id) {
    const p = products.find(p => p.id === id);
    if (!p) return;
    deleteTargetId = id;
    $('delete-product-name').textContent = p.title;
    $('delete-modal').style.display = 'flex';
  }
  function closeDeleteModal() { $('delete-modal').style.display = 'none'; deleteTargetId = null; }

  // === Image ===
  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('❌ 圖片不可超過 5MB'); return; }
    pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      $('preview-img').src = ev.target.result;
      $('preview-img').style.display = 'block';
      $('image-placeholder').style.display = 'none';
      $('image-preview').classList.add('has-image');
    };
    reader.readAsDataURL(file);
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > MAX_IMAGE_WIDTH) { h = Math.round(h * MAX_IMAGE_WIDTH / w); w = MAX_IMAGE_WIDTH; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png', 0.9).split(',')[1]);
      };
      img.onerror = () => reject(new Error('圖片讀取失敗'));
      img.src = URL.createObjectURL(file);
    });
  }

  // === Submit ===
  async function handleProductSubmit(e) {
    e.preventDefault();
    const btn = $('modal-submit');
    btn.disabled = true;
    btn.querySelector('.btn-submit-text').style.display = 'none';
    btn.querySelector('.btn-submit-loading').style.display = 'inline';

    try {
      const title = $('form-title').value.trim();
      const description = $('form-desc').value.trim();
      const price = parseInt($('form-price').value);
      const stock = parseInt($('form-stock').value);
      let imagePath = '';

      if (pendingImageFile) {
        const safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').toLowerCase();
        const filename = `${safeName}_${Date.now()}.png`;
        const base64 = await compressImage(pendingImageFile);
        showToast('📤 上傳圖片中...');
        await apiFetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ filename, content: base64, message: `上傳: ${filename}` }),
        });
        imagePath = `images/${filename}`;
      }

      if (editingId) {
        const idx = products.findIndex(p => p.id === editingId);
        if (idx >= 0) {
          products[idx] = { ...products[idx], title, description, price, stock };
          if (imagePath) products[idx].image = imagePath;
        }
      } else {
        const maxId = products.length ? Math.max(...products.map(p => p.id)) : 0;
        products.push({ id: maxId + 1, title, description, image: imagePath || 'images/placeholder.png', price, stock });
      }

      showToast('💾 儲存中...');
      const result = await apiFetch('/api/products', {
        method: 'PUT',
        body: JSON.stringify({ products, sha: productsSha, message: editingId ? `更新: ${title}` : `新增: ${title}` }),
      });
      productsSha = result.sha;

      renderProducts();
      closeProductModal();
      showToast(editingId ? '✅ 商品已更新' : '✅ 商品已新增');
    } catch (err) {
      showToast('❌ ' + err.message);
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-submit-text').style.display = 'inline';
      btn.querySelector('.btn-submit-loading').style.display = 'none';
    }
  }

  // === Delete ===
  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    const product = products.find(p => p.id === deleteTargetId);
    if (!product) return;
    const btn = $('delete-confirm');
    btn.disabled = true; btn.textContent = '刪除中...';

    try {
      products = products.filter(p => p.id !== deleteTargetId);
      const result = await apiFetch('/api/products', {
        method: 'PUT',
        body: JSON.stringify({ products, sha: productsSha, message: `刪除: ${product.title}` }),
      });
      productsSha = result.sha;

      if (product.image && product.image.startsWith('images/')) {
        try { await apiFetch('/api/delete-image', { method: 'POST', body: JSON.stringify({ path: product.image }) }); } catch {}
      }

      renderProducts();
      closeDeleteModal();
      showToast('✅ 商品已刪除');
    } catch (err) {
      showToast('❌ ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = '確認刪除';
    }
  }

  // === Toast ===
  let toastTimer;
  function showToast(msg) {
    clearTimeout(toastTimer);
    $('toast-msg').textContent = msg.replace(/^[^\s]+\s/, m => '');
    $('toast-icon').textContent = msg.match(/^[^\s]+/)?.[0] || '✅';
    $('admin-toast').classList.add('show');
    toastTimer = setTimeout(() => $('admin-toast').classList.remove('show'), 3000);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { editProduct, deleteProduct };
})();
