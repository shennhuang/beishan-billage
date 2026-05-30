/**
 * App Module — 主控制器
 */
const App = (() => {
  // DOM refs
  const cartBadge = document.getElementById('cart-badge');
  const cartOverlay = document.getElementById('cart-overlay');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartBody = document.getElementById('cart-body');
  const cartFooter = document.getElementById('cart-footer');
  const cartToggle = document.getElementById('cart-toggle');
  const cartClose = document.getElementById('cart-close');
  const modalOverlay = document.getElementById('modal-overlay');
  const toast = document.getElementById('toast');
  const productsGrid = document.getElementById('products-grid');

  let toastTimer;

  function init() {
    // Load and render products
    Products.load().then(() => Products.render(productsGrid));

    // Bind events
    cartToggle.addEventListener('click', openCart);
    cartClose.addEventListener('click', closeCart);
    cartOverlay.addEventListener('click', closeCart);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); closeModal(); } });

    // Listen cart changes
    Cart.onChange(updateCartUI);
    updateCartUI(Cart.getItems());
  }

  function openCart() {
    cartOverlay.classList.add('open');
    cartDrawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    cartOverlay.classList.remove('open');
    cartDrawer.classList.remove('open');
    document.body.style.overflow = '';
  }

  function updateCartUI(items) {
    // Badge
    const count = Cart.getCount();
    cartBadge.textContent = count;
    if (count > 0) {
      cartBadge.classList.add('show');
      cartBadge.classList.remove('bounce');
      void cartBadge.offsetWidth; // reflow
      cartBadge.classList.add('bounce');
    } else {
      cartBadge.classList.remove('show');
    }

    // Cart body
    if (items.length === 0) {
      cartBody.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <p>購物車是空的<br><span style="font-size:0.85rem;color:var(--text-muted)">快去挑選喜歡的商品吧！</span></p>
        </div>`;
      cartFooter.style.display = 'none';
      return;
    }

    cartFooter.style.display = 'block';
    cartBody.innerHTML = items.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <img class="cart-item-image" src="${item.image}" alt="${item.title}">
        <div class="cart-item-details">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-price">NT$${item.price.toLocaleString()}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-id="${item.id}" title="移除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    // Bind cart item events
    cartBody.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const delta = btn.dataset.action === 'inc' ? 1 : -1;
        Cart.updateQty(id, delta);
      });
    });

    cartBody.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.removeItem(parseInt(btn.dataset.id));
      });
    });

    // Footer summary
    const total = Cart.getTotal();
    const totalCount = Cart.getCount();
    cartFooter.innerHTML = `
      <div class="cart-summary-row">
        <span>共 ${totalCount} 件商品</span>
        <span>${items.length} 種品項</span>
      </div>
      <div class="cart-total-row">
        <span>合計</span>
        <span>NT$${total.toLocaleString()}</span>
      </div>
      <div class="cart-actions">
        <button class="btn-clear" id="btn-clear">清空購物車</button>
        <button class="btn-checkout" id="btn-checkout">前往結帳</button>
      </div>`;

    document.getElementById('btn-clear').addEventListener('click', () => {
      Cart.clear();
      showToast('購物車已清空');
    });

    document.getElementById('btn-checkout').addEventListener('click', openCheckoutModal);
  }

  function openCheckoutModal() {
    const items = Cart.getItems();
    const total = Cart.getTotal();
    const modal = document.getElementById('modal-overlay');

    modal.querySelector('.modal').innerHTML = `
      <h2>📋 訂單確認</h2>
      <p class="modal-subtitle">請確認您的訂單內容</p>
      <div class="modal-items">
        ${items.map(i => `
          <div class="modal-item">
            <span><span class="modal-item-name">${i.title}</span><span class="modal-item-qty"> × ${i.qty}</span></span>
            <span class="modal-item-subtotal">NT$${(i.price * i.qty).toLocaleString()}</span>
          </div>`).join('')}
      </div>
      <div class="modal-total">
        <span>總金額</span>
        <span>NT$${total.toLocaleString()}</span>
      </div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" id="modal-cancel">返回</button>
        <button class="btn-modal-confirm" id="modal-confirm">確認結帳</button>
      </div>`;

    modal.classList.add('open');
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', () => {
      // Show success
      modal.querySelector('.modal').innerHTML = `
        <div class="modal-success">
          <div class="checkmark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>訂單已送出！</h3>
          <p>感謝您的購買，我們會盡快為您處理訂單。</p>
          <button class="btn-modal-confirm" id="modal-done" style="width:100%">完成</button>
        </div>`;
      Cart.clear();
      closeCart();
      document.getElementById('modal-done').addEventListener('click', closeModal);
    });
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  function showToast(msg) {
    clearTimeout(toastTimer);
    toast.querySelector('span').textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  return { init, showToast };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
