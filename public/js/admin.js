const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `خطأ ${response.status}`);
  }

  return data;
}

function showLogin() {
  $('loginSection').classList.remove('hidden');
  $('dashboardSection').classList.add('hidden');
  $('logoutButton').classList.add('hidden');
}

function showDashboard() {
  $('loginSection').classList.add('hidden');
  $('dashboardSection').classList.remove('hidden');
  $('logoutButton').classList.remove('hidden');
}

function showOwnerWelcome() {
  const overlay = $('ownerWelcome');
  if (!overlay) return;

  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('show');

  window.setTimeout(() => {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }, 2600);
}

function msg(id, text, error = false) {
  $(id).textContent = text;
  $(id).style.color = error ? '#b22' : '#28733b';
}

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = value ?? '';
  row.appendChild(td);
  return td;
}

async function loadProducts() {
  const products = await api('/api/products');
  const host = $('productsList');
  host.replaceChildren();
  $('statProducts').textContent = products.length;

  if (!products.length) {
    host.textContent = 'لا توجد منتجات حتى الآن.';
    return;
  }

  const table = document.createElement('table');
  const head = document.createElement('tr');

  ['الصورة', 'المنتج', 'السعر', 'الكمية', 'إجراء'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });

  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  products.forEach(p => {
    const row = document.createElement('tr');
    const imageCell = document.createElement('td');

    if (p.image) {
      const image = document.createElement('img');
      image.src = p.image;
      image.alt = p.name;
      image.width = 48;
      imageCell.appendChild(image);
    } else {
      imageCell.textContent = 'بدون صورة';
    }

    row.appendChild(imageCell);
    cell(row, p.name);
    cell(row, `${p.price} ج.م`);
    cell(row, p.stock);

    const action = document.createElement('td');

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'تعديل';
    editButton.className = 'button secondary';
    editButton.style.marginInlineEnd = '6px';
    editButton.addEventListener('click', () => beginProductEdit(p));
    action.appendChild(editButton);

    const button = document.createElement('button');
    button.textContent = 'حذف';
    button.className = 'button delete-button';

    button.addEventListener('click', async () => {
      if (!confirm(`حذف المنتج ${p.name}؟`)) return;

      try {
        await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
        await loadProducts();
        msg('dashboardMessage', 'تم حذف المنتج.');
      } catch (e) {
        msg('dashboardMessage', e.message, true);
      }
    });

    action.appendChild(button);
    row.appendChild(action);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  host.appendChild(table);
}

async function loadOrders() {
  const orders = await api('/api/admin/orders');
  const host = $('ordersList');
  host.replaceChildren();

  $('statOrders').textContent = orders.length;
  $('statNewOrders').textContent =
    orders.filter(o => o.status === 'جديد').length;

  if (!orders.length) {
    host.textContent = 'لا توجد طلبات حتى الآن.';
    return;
  }

  const table = document.createElement('table');
  const head = document.createElement('tr');

  ['رقم الطلب', 'العميل', 'الهاتف', 'الإجمالي', 'التاريخ', 'الحالة']
    .forEach(t => {
      const th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    });

  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const statuses = ['جديد', 'قيد التجهيز', 'تم الشحن', 'مكتمل', 'ملغي'];

  orders.forEach(order => {
    const row = document.createElement('tr');
    cell(row, `#${order.id}`);
    cell(row, order.customer_name);
    cell(row, order.phone);
    cell(row, `${order.total} ج.م`);
    cell(row, order.created_at);

    const td = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status-select';

    statuses.forEach(status => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      option.selected = status === order.status;
      select.appendChild(option);
    });

    select.addEventListener('change', async () => {
      try {
        await api(`/api/admin/orders/${order.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        });
        msg('dashboardMessage', 'تم تحديث حالة الطلب.');
        await loadOrders();
      } catch (e) {
        msg('dashboardMessage', e.message, true);
      }
    });

    td.appendChild(select);
    row.appendChild(td);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  host.appendChild(table);
}

async function refreshAll() {
  try {
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (e) {
    msg('dashboardMessage', e.message, true);
  }
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  msg('loginMessage', 'جارٍ تسجيل الدخول...');

  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('username').value,
        password: $('password').value
      })
    });

    $('password').value = '';
    showDashboard();
    await refreshAll();
    showOwnerWelcome();
  } catch (e) {
    msg('loginMessage', e.message, true);
  }
});

$('logoutButton').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } finally {
    showLogin();
  }
});



let editingProductId = null;

function beginProductEdit(product) {
  editingProductId = product.id;
  const form = $('productForm');

  form.elements.name.value = product.name || '';
  form.elements.category.value = product.category || 'both';
  form.elements.price.value = product.price ?? 0;
  form.elements.stock.value = product.stock ?? 0;
  form.elements.description.value = product.description || '';

  $('sizeRows').replaceChildren();
  $('colorRows').replaceChildren();

  (Array.isArray(product.sizes) ? product.sizes : []).forEach(size => {
    addSizeRow();
    const row = $('sizeRows').lastElementChild;
    row.querySelector('[data-size-name]').value = size.name || '';
    row.querySelector('[data-size-stock]').value = size.stock ?? 0;
  });

  (Array.isArray(product.colors) ? product.colors : []).forEach(color => {
    addColorRow();
    const row = $('colorRows').lastElementChild;
    row.querySelector('[data-color-name]').value = color.name || '';

    const file = row.querySelector('[data-color-image]');
    file.required = false;
    file.dataset.existingImage = color.image || '';

    const preview = row.querySelector('.color-preview');
    if (color.image) {
      preview.src = color.image;
      preview.classList.remove('hidden');
    }
  });

  const submit = form.querySelector('[type="submit"]');
  submit.textContent = 'حفظ التعديلات';
  let cancel = $('cancelProductEdit');

  if (!cancel) {
    cancel = document.createElement('button');
    cancel.id = 'cancelProductEdit';
    cancel.type = 'button';
    cancel.className = 'button secondary';
    cancel.textContent = 'إلغاء التعديل';
    submit.insertAdjacentElement('afterend', cancel);
    cancel.addEventListener('click', resetProductEditor);
  }

  cancel.classList.remove('hidden');
  msg('productMessage', `تعديل المنتج: ${product.name}`);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProductEditor() {
  editingProductId = null;
  $('productForm').reset();
  $('sizeRows').replaceChildren();
  $('colorRows').replaceChildren();

  const submit = $('productForm').querySelector('[type="submit"]');
  submit.textContent = 'حفظ المنتج';
  $('cancelProductEdit')?.classList.add('hidden');
  msg('productMessage', 'تم إلغاء التعديل.');
}

function addSizeRow() {
  const row = document.createElement('div');
  row.className = 'size-row';
  row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;margin-bottom:10px';

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'المقاس مثل M';
  name.maxLength = 30;
  name.setAttribute('aria-label', 'اسم المقاس');
  name.dataset.sizeName = '';

  const stock = document.createElement('input');
  stock.type = 'number';
  stock.min = '0';
  stock.step = '1';
  stock.value = '1';
  stock.setAttribute('aria-label', 'كمية المقاس');
  stock.dataset.sizeStock = '';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button secondary';
  remove.textContent = 'حذف';
  remove.addEventListener('click', () => row.remove());

  row.append(name, stock, remove);
  $('sizeRows').appendChild(row);
}

if ($('addSizeRow') && $('sizeRows')) {
  $('addSizeRow').addEventListener('click', addSizeRow);
}

function addColorRow() {
  const host = $('colorRows');

  if (host.querySelectorAll('.color-row').length >= 20) {
    msg('productMessage', 'يمكنك إضافة حتى 20 لونًا فقط.', true);
    return;
  }

  const row = document.createElement('div');
  row.className = 'color-row';
  row.style.cssText = 'display:grid;grid-template-columns:minmax(100px,1fr) minmax(150px,2fr) auto;gap:8px;align-items:start;margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:10px';

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'اسم اللون مثل أسود';
  name.maxLength = 40;
  name.required = true;
  name.dataset.colorName = '';
  name.setAttribute('aria-label', 'اسم اللون');

  const imageBox = document.createElement('div');
  imageBox.style.cssText = 'display:flex;flex-direction:column;gap:8px';

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/jpeg,image/png,image/webp,image/gif';
  file.required = true;
  file.dataset.colorImage = '';
  file.setAttribute('aria-label', 'صورة اللون');

  const preview = document.createElement('img');
  preview.className = 'color-preview hidden';
  preview.alt = 'معاينة صورة اللون';
  preview.style.cssText = 'max-width:110px;max-height:130px;object-fit:contain;border-radius:8px';

  imageBox.append(file, preview);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button secondary';
  remove.textContent = 'حذف';
  remove.addEventListener('click', () => row.remove());

  row.append(name, imageBox, remove);
  host.appendChild(row);
}

$('addColorRow').addEventListener('click', addColorRow);

$('colorRows').addEventListener('change', event => {
  const fileInput = event.target.closest('[data-color-image]');
  if (!fileInput) return;

  const row = fileInput.closest('.color-row');
  const preview = row.querySelector('.color-preview');
  const file = fileInput.files[0];

  if (!file) {
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    return;
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
    msg('productMessage', 'اختار صورة JPG أو PNG أو WEBP أو GIF لا تتجاوز 5MB.', true);
    fileInput.value = '';
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    return;
  }

  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
});

$('productForm').addEventListener('submit', async event => {
  event.preventDefault();
  msg('productMessage', 'جارٍ حفظ المنتج...');

  try {
    const form = new FormData(event.currentTarget);

    const sizes = [...$('sizeRows').querySelectorAll('.size-row')].map(row => ({
      name: row.querySelector('[data-size-name]').value.trim(),
      stock: Number(row.querySelector('[data-size-stock]').value)
    }));

    if (sizes.length > 20 ||
        sizes.some(size => !size.name || !Number.isInteger(size.stock) || size.stock < 0)) {
      throw new Error('تحقق من أسماء المقاسات وكمياتها (حتى 20 مقاسًا).');
    }

    const normalizedSizes = sizes.map(size => size.name.toLowerCase());
    if (new Set(normalizedSizes).size !== normalizedSizes.length) {
      throw new Error('لا يمكن تكرار نفس المقاس.');
    }

    const rows = [...$('colorRows').querySelectorAll('.color-row')];
    if (rows.length < 1 || rows.length > 20) {
      throw new Error('أضف لونًا واحدًا على الأقل، وحتى 20 لونًا.');
    }

    const colors = [];
    const normalizedColors = new Set();

    rows.forEach((row, index) => {
      const name = row.querySelector('[data-color-name]').value.trim();
      const fileInput = row.querySelector('[data-color-image]');
      const file = fileInput.files[0];
      const existingImage = fileInput.dataset.existingImage || '';

      if (!name) throw new Error('اكتب اسم كل لون.');

      if (!file && !(editingProductId && existingImage)) {
        throw new Error(`اختار صورة للون ${name}.`);
      }

      if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
          file.size > 5 * 1024 * 1024)) {
        throw new Error(`صورة اللون ${name} غير صالحة أو أكبر من 5MB.`);
      }

      const key = name.toLowerCase();
      if (normalizedColors.has(key)) throw new Error('لا يمكن تكرار نفس اللون.');
      normalizedColors.add(key);

      if (file) {
        const field = `colorImage${index}`;
        colors.push({ name, field });
        form.append(field, file);
      } else {
        colors.push({ name, image: existingImage });
      }
    });

    form.set('category', $('productCategory').value);
    form.set('sizes', JSON.stringify(sizes));
    form.set('colors', JSON.stringify(colors));
    form.delete('image');

    const editing = editingProductId !== null;
    const endpoint = editing
      ? `/api/admin/products/${editingProductId}`
      : '/api/admin/products';

    await api(endpoint, {
      method: editing ? 'PUT' : 'POST',
      body: form
    });

    resetProductEditor();
    await loadProducts();
    msg('productMessage', editing
      ? 'تم تعديل المنتج بنجاح.'
      : 'تم حفظ المنتج وصور ألوانه بنجاح.');
  } catch (e) {
    msg('productMessage', e.message, true);
  }
});

$('refreshProducts').addEventListener('click', loadProducts);
$('refreshOrders').addEventListener('click', loadOrders);

async function init() {
  try {
    await api('/api/admin/me');
    showDashboard();
    await refreshAll();
  } catch {
    showLogin();
  }
}

init();
