/**
 * Cart Module — 購物車邏輯
 * 使用 localStorage 持久化
 */
const Cart = (() => {
  const STORAGE_KEY = 'beishan_cart';
  let items = [];
  let listeners = [];

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      items = saved ? JSON.parse(saved) : [];
    } catch {
      items = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    listeners.forEach(fn => fn(items));
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function getItems() {
    return [...items];
  }

  function getCount() {
    return items.reduce((sum, i) => sum + i.qty, 0);
  }

  function getTotal() {
    return items.reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function addItem(product) {
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      if (existing.qty < product.stock) existing.qty++;
    } else {
      items.push({
        id: product.id,
        title: product.title,
        image: product.image,
        price: product.price,
        stock: product.stock,
        qty: 1,
      });
    }
    save();
  }

  function updateQty(id, delta) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      items = items.filter(i => i.id !== id);
    } else if (item.qty > item.stock) {
      item.qty = item.stock;
    }
    save();
  }

  function removeItem(id) {
    items = items.filter(i => i.id !== id);
    save();
  }

  function clear() {
    items = [];
    save();
  }

  load();

  return { getItems, getCount, getTotal, addItem, updateQty, removeItem, clear, onChange };
})();
