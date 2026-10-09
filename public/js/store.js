const grid = document.getElementById('productGrid');
const countLabel = document.getElementById('productCount');
const toast = document.getElementById('toast');
const dialog = document.getElementById('productDialog');
const detailImage = document.getElementById('detailImage');
const detailName = document.getElementById('detailName');
const detailDescription = document.getElementById('detailDescription');
const detailPrice = document.getElementById('detailPrice');
const detailColors = document.getElementById('detailColors');
const detailSize = document.getElementById('detailSize');
const detailQuantity = document.getElementById('detailQuantity');
const sizeAvailability = document.getElementById('sizeAvailability');
const buyButton = document.getElementById('buyWhatsApp');

document.getElementById('year').textContent = new Date().getFullYear();

let products = [];
let activeCategory = 'all';
let activeProduct = null;
let activeColor = null;

const WHATSAPP_NUMBER = '201042265026';

function money(value) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function getColors(product) {
  return Array.isArray(product.colors)
    ? product.colors.filter(c => c && c.name && c.image)
    : [];
}

function getSizes(product) {
  return Array.isArray(product.sizes)
    ? product.sizes.filter(s => s && s.name)
    : [];
}

function productImage(product) {
  const colors = getColors(product);
  return colors[0]?.image || product.image || '';
}

function renderProducts() {
  const visibleProducts = activeCategory === 'all'
    ? products
    : products.filter(product =>
        product.category === 'both' || product.category === activeCategory
      );

  countLabel.textContent = `${visibleProducts.length} منتجات`;
  grid.replaceChildren();

  if (!visibleProducts.length) {
    grid.innerHTML = '<div class="empty">لسه مفيش منتجات. قريبًا هتظهر المنتجات اللي تضيفها من لوحة التحكم.</div>';
    return;
  }

  for (const product of visibleProducts) {
    const card = document.createElement('article');
    card.className = 'product-card product-card-clickable';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `عرض تفاصيل ${product.name}`);

    const src = productImage(product);
    if (src) {
      const image = document.createElement('img');
      image.className = 'product-image';
      image.src = src;
      image.alt = product.name;
      image.loading = 'lazy';
      image.onerror = () => {
        image.alt = 'الصورة غير متاحة';
      };
      card.appendChild(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'product-placeholder';
      placeholder.textContent = 'متجر توبة | TOBA STORE';
      card.appendChild(placeholder);
    }

    const info = document.createElement('div');
    info.className = 'product-info';

    const title = document.createElement('h3');
    title.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || 'قطعة مميزة من تشكيلتنا';

    const bottom = document.createElement('div');
    bottom.className = 'product-bottom';

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = money(product.price);

    const button = document.createElement('button');
    button.className = 'add-button';
    button.type = 'button';
    button.textContent = 'عرض التفاصيل';
    button.disabled = Number(product.stock) < 1;
    button.addEventListener('click', event => {
      event.stopPropagation();
      openProduct(product.id);
    });

    bottom.append(price, button);
    info.append(title, description, bottom);
    card.appendChild(info);

    card.addEventListener('click', () => openProduct(product.id));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProduct(product.id);
      }
    });

    grid.appendChild(card);
  }
}


document.querySelectorAll('.category-card.men, .category-card.women').forEach(card => {
  card.addEventListener('click', () => {
    activeCategory = card.classList.contains('men') ? 'men' : 'women';
    renderProducts();
  });
});

function openProduct(id) {
  const product = products.find(p => String(p.id) === String(id));
  if (!product) return;

  activeProduct = product;
  const colors = getColors(product);
  const sizes = getSizes(product);

  detailName.textContent = product.name;
  detailDescription.textContent = product.description || 'قطعة مميزة من تشكيلتنا';
  detailPrice.textContent = money(product.price);

  activeColor = colors[0] || null;
  detailColors.replaceChildren();

  if (colors.length) {
    colors.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-choice';
      button.textContent = color.name;
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');

      button.addEventListener('click', () => {
        activeColor = color;
        detailImage.src = color.image;
        detailImage.alt = `${product.name} - ${color.name}`;
        detailColors.querySelectorAll('.color-choice').forEach(item => {
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
        });
      });

      detailColors.appendChild(button);
    });
  } else {
    const noColors = document.createElement('span');
    noColors.className = 'muted';
    noColors.textContent = 'اللون الأساسي';
    detailColors.appendChild(noColors);
  }

  const image = activeColor?.image || product.image || '';
  detailImage.src = image;
  detailImage.alt = product.name;

  detailSize.replaceChildren();
  const availableSizes = sizes.filter(size => Number(size.stock) > 0);

  if (sizes.length) {
    for (const size of (availableSizes.length ? availableSizes : sizes)) {
      const option = document.createElement('option');
      option.value = size.name;
      option.textContent = availableSizes.length
        ? `${size.name} — متاح ${size.stock}`
        : `${size.name} — غير متاح`;
      option.disabled = Number(size.stock) < 1;
      detailSize.appendChild(option);
    }
    sizeAvailability.textContent = availableSizes.length
      ? 'اختار المقاس المناسب.'
      : 'المقاسات غير متاحة حاليًا.';
  } else {
    const option = document.createElement('option');
    option.value = 'مقاس موحد';
    option.textContent = 'مقاس موحد';
    detailSize.appendChild(option);
    sizeAvailability.textContent = 'مقاس موحد';
  }

  detailQuantity.value = '1';
  detailQuantity.max = String(Math.max(1, Number(product.stock) || 1));
  buyButton.disabled = Number(product.stock) < 1 ||
    (sizes.length > 0 && availableSizes.length === 0);

  if (!dialog.open) dialog.showModal();
}

document.getElementById('closeProduct').addEventListener('click', () => dialog.close());

dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

buyButton.addEventListener('click', () => {
  if (!activeProduct) return;

  const quantity = Number.parseInt(detailQuantity.value, 10);
  const product = activeProduct;
  const sizes = getSizes(product);
  const selectedSize = sizes.find(size => size.name === detailSize.value);

  if (!Number.isInteger(quantity) || quantity < 1) {
    showToast('اكتب كمية صحيحة.');
    return;
  }

  const maxStock = selectedSize
    ? Number(selectedSize.stock)
    : Number(product.stock);

  if (quantity > maxStock) {
    showToast('الكمية المطلوبة أكبر من المتاح.');
    return;
  }

  if (Number(product.stock) < 1) {
    showToast('المنتج غير متاح حاليًا.');
    return;
  }

  const colorName = activeColor?.name || 'اللون الأساسي';
  const sizeName = detailSize.value || 'مقاس موحد';
  const total = Number(product.price) * quantity;

  const message = [
    'السلام عليكم، عايز أطلب المنتج ده:',
    `المنتج: ${product.name}`,
    `اللون: ${colorName}`,
    `المقاس: ${sizeName}`,
    `السعر: ${money(product.price)}`,
    `الكمية: ${quantity}`,
    `الإجمالي: ${money(total)}`
  ].join('\n');

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.location.href = url;
});

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('تعذر تحميل المنتجات');
    products = await response.json();
    renderProducts();
  } catch {
    grid.textContent = 'تعذر تحميل المنتجات. تأكد أن السيرفر يعمل.';
    countLabel.textContent = '';
  }
}

loadProducts();
