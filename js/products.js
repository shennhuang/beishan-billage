/**
 * Products Module — 商品渲染
 */
const Products = (() => {
  // === Config ===
  const API_BASE = localStorage.getItem('beishan_api_url') || 'https://beishan-admin-api.beishan-village.workers.dev';
  let productsData = [];

  async function load() {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      productsData = data.products;
    } catch (err) {
      console.warn('Failed to load products from API, falling back to static products.json', err);
      const res = await fetch('data/products.json');
      productsData = await res.json();
    }
    return productsData;
  }

  function render(container) {
    container.innerHTML = productsData.map(p => `
      <div class="product-card" id="product-${p.id}">
        <div class="product-image-wrap">
          <img src="${p.image}" alt="${p.title}" loading="lazy">
          <span class="product-stock-badge">庫存 ${p.stock}</span>
        </div>
        <div class="product-info">
          <h3 class="product-title">${p.title}</h3>
          <p class="product-desc">${p.description}</p>
          <div class="product-bottom">
            <div class="product-price"><span>NT$</span>${p.price.toLocaleString()}</div>
            <button class="btn-add" data-id="${p.id}" id="btn-add-${p.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              加入購物車
            </button>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const product = productsData.find(p => p.id === id);
        if (product) {
          Cart.addItem(product);
          btn.classList.add('added');
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 已加入`;
          App.showToast(`${product.title} 已加入購物車`);
          setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> 加入購物車`;
          }, 1200);
        }
      });
    });
  }

  return { load, render };
})();
