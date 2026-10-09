require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'store.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL CHECK(price >= 0),
    image TEXT DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'جديد',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
`);

const productColumns = db.prepare('PRAGMA table_info(products)').all();

if (!productColumns.some(column => column.name === 'sizes')) {
  db.exec("ALTER TABLE products ADD COLUMN sizes TEXT NOT NULL DEFAULT '[]'");
}
if (!productColumns.some(column => column.name === 'colors')) {
  db.exec("ALTER TABLE products ADD COLUMN colors TEXT NOT NULL DEFAULT '[]'");
}

if (!productColumns.some(column => column.name === 'category')) {
  db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'both'");
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  console.error('خطأ: أضف SESSION_SECRET قويًا في ملف .env قبل التشغيل.');
  process.exit(1);
}

app.use(session({
  name: 'pro_store_session',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 4
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 20, fields: 40 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('مسموح فقط بصور JPG وPNG وWEBP وGIF.'));
    }
    cb(null, true);
  }
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'سجّل دخول لوحة التحكم أولًا.' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'TOBA STORE' });
});

app.get('/api/products', (req, res) => {
  const products = db.prepare(`
    SELECT id, name, description, price, image, stock, sizes, colors, category
    FROM products ORDER BY id DESC
  `).all();

  const result = products.map(product => {
    let sizes = [];
    let colors = [];

    try {
      sizes = JSON.parse(product.sizes || '[]');
      if (!Array.isArray(sizes)) sizes = [];
    } catch {}

    try {
      colors = JSON.parse(product.colors || '[]');
      if (!Array.isArray(colors)) colors = [];
    } catch {}

    return { ...product, sizes, colors };
  });

  res.json(result);
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'اكتب اسم المستخدم وكلمة المرور.' });
  }

  const admin = db.prepare(
    'SELECT id, username, password_hash FROM admins WHERE username = ?'
  ).get(username.trim());

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'تعذر بدء الجلسة.' });
    req.session.adminId = admin.id;
    res.json({ ok: true, username: admin.username });
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('pro_store_session');
    res.json({ ok: true });
  });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT username FROM admins WHERE id = ?')
    .get(req.session.adminId);
  res.json({ username: admin.username });
});

app.post('/api/admin/products', requireAdmin, upload.any(), (req, res) => {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  const fail = (status, message) => {
    for (const file of uploadedFiles) {
      fs.unlink(file.path, () => {});
    }
    return res.status(status).json({ error: message });
  };

  const { name, description = '', price, stock = 0 } = req.body;
  const numericPrice = Number(price);
  let numericStock = Number(stock);
  let sizes = [];
  let colorInput = [];

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) {
    return fail(400, 'اسم المنتج مطلوب وبحد أقصى 150 حرفًا.');
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return fail(400, 'السعر غير صحيح.');
  }
  if (!Number.isInteger(numericStock) || numericStock < 0) {
    return fail(400, 'الكمية يجب أن تكون رقمًا صحيحًا غير سالب.');
  }

  const category = req.body.category;
  if (!['men', 'women', 'both'].includes(category)) {
    return fail(400, 'اختار تصنيف المنتج: رجالي أو حريمي أو الاتنين.');
  }

  try {
    sizes = JSON.parse(req.body.sizes || '[]');
  } catch {
    return fail(400, 'بيانات المقاسات غير صالحة.');
  }

  if (!Array.isArray(sizes) || sizes.length > 20) {
    return fail(400, 'أضف حتى 20 مقاسًا فقط.');
  }

  const seenSizes = new Set();
  for (const size of sizes) {
    if (!size || typeof size.name !== 'string' ||
        !size.name.trim() || size.name.trim().length > 30 ||
        !Number.isInteger(size.stock) || size.stock < 0) {
      return fail(400, 'تحقق من اسم وكمية كل مقاس.');
    }

    const key = size.name.trim().toLowerCase();
    if (seenSizes.has(key)) {
      return fail(400, 'لا تكرر اسم المقاس.');
    }
    seenSizes.add(key);
    size.name = size.name.trim();
  }

  if (sizes.length > 0) {
    numericStock = sizes.reduce((sum, size) => sum + size.stock, 0);
    if (!Number.isSafeInteger(numericStock)) {
      return fail(400, 'إجمالي الكمية كبير جدًا.');
    }
  }

  try {
    colorInput = JSON.parse(req.body.colors || '[]');
  } catch {
    return fail(400, 'بيانات الألوان غير صالحة.');
  }

  if (!Array.isArray(colorInput) || colorInput.length < 1 || colorInput.length > 20) {
    return fail(400, 'أضف لونًا واحدًا على الأقل، وحتى 20 لونًا.');
  }

  const filesByField = new Map();
  for (const file of uploadedFiles) {
    if (!/^colorImage\d+$/.test(file.fieldname) || filesByField.has(file.fieldname)) {
      return fail(400, 'ملفات الصور المرفوعة غير صالحة.');
    }
    filesByField.set(file.fieldname, file);
  }

  if (uploadedFiles.length !== colorInput.length) {
    return fail(400, 'اختار صورة لكل لون قبل حفظ المنتج.');
  }

  const seenColors = new Set();
  const colors = [];

  for (const color of colorInput) {
    if (!color || typeof color.name !== 'string' ||
        !color.name.trim() || color.name.trim().length > 40 ||
        typeof color.field !== 'string' ||
        !/^colorImage\d+$/.test(color.field)) {
      return fail(400, 'تحقق من اسم كل لون وصورته.');
    }

    const key = color.name.trim().toLowerCase();
    if (seenColors.has(key)) {
      return fail(400, 'لا تكرر اسم اللون.');
    }
    seenColors.add(key);

    const file = filesByField.get(color.field);
    if (!file) {
      return fail(400, `اختار صورة للون ${color.name.trim()}.`);
    }

    colors.push({
      name: color.name.trim(),
      image: '/uploads/' + file.filename
    });
  }

  try {
    const image = colors[0].image;
    const result = db.prepare(`
      INSERT INTO products
        (name, description, price, image, stock, sizes, colors, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      String(description).slice(0, 2000),
      numericPrice,
      image,
      numericStock,
      JSON.stringify(sizes),
      JSON.stringify(colors),
      category
    );

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    for (const file of uploadedFiles) {
      fs.unlink(file.path, () => {});
    }
    console.error('تعذر حفظ المنتج:', error.message);
    res.status(500).json({ error: 'تعذر حفظ المنتج. حاول مرة أخرى.' });
  }
});


app.put('/api/admin/products/:id', requireAdmin, upload.any(), (req, res) => {
  const uploaded = Array.isArray(req.files) ? req.files : [];
  const cleanup = () => uploaded.forEach(f => fs.unlink(f.path, () => {}));
  const fail = (status, error) => {
    cleanup();
    return res.status(status).json({ error });
  };

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return fail(400, 'رقم المنتج غير صحيح.');
  }

  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!old) return fail(404, 'المنتج غير موجود.');

  const { name, description = '', price, stock = 0 } = req.body;
  const numericPrice = Number(price);
  let numericStock = Number(stock);

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150)
    return fail(400, 'اسم المنتج مطلوب وبحد أقصى 150 حرفًا.');

  if (!Number.isFinite(numericPrice) || numericPrice < 0)
    return fail(400, 'السعر غير صحيح.');

  if (!Number.isInteger(numericStock) || numericStock < 0)
    return fail(400, 'الكمية يجب أن تكون رقمًا صحيحًا غير سالب.');

  const category = req.body.category;
  if (!['men', 'women', 'both'].includes(category))
    return fail(400, 'تصنيف المنتج غير صحيح.');

  let sizes, colorInput;
  try {
    sizes = JSON.parse(req.body.sizes || '[]');
    colorInput = JSON.parse(req.body.colors || '[]');
  } catch {
    return fail(400, 'بيانات المقاسات أو الألوان غير صالحة.');
  }

  if (!Array.isArray(sizes) || sizes.length > 20)
    return fail(400, 'أضف حتى 20 مقاسًا فقط.');

  const seenSizes = new Set();
  for (const s of sizes) {
    if (!s || typeof s.name !== 'string' || !s.name.trim() ||
        s.name.trim().length > 30 || !Number.isInteger(s.stock) || s.stock < 0)
      return fail(400, 'تحقق من اسم وكمية كل مقاس.');

    const key = s.name.trim().toLowerCase();
    if (seenSizes.has(key)) return fail(400, 'لا تكرر اسم المقاس.');
    seenSizes.add(key);
    s.name = s.name.trim();
  }

  if (sizes.length) {
    numericStock = sizes.reduce((sum, s) => sum + s.stock, 0);
    if (!Number.isSafeInteger(numericStock))
      return fail(400, 'إجمالي الكمية كبير جدًا.');
  }

  if (!Array.isArray(colorInput) || colorInput.length < 1 || colorInput.length > 20)
    return fail(400, 'يجب إضافة لون واحد على الأقل وحتى 20 لونًا.');

  const filesByField = new Map();
  for (const file of uploaded) {
    if (!/^colorImage\d+$/.test(file.fieldname) || filesByField.has(file.fieldname))
      return fail(400, 'ملفات الصور المرفوعة غير صالحة.');
    filesByField.set(file.fieldname, file);
  }

  const oldColors = (() => {
    try {
      const parsed = JSON.parse(old.colors || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const oldImages = new Set(oldColors.map(c => c && c.image).filter(Boolean));
  if (old.image) oldImages.add(old.image);

  const seenColors = new Set();
  const colors = [];

  for (const c of colorInput) {
    if (!c || typeof c.name !== 'string' || !c.name.trim() ||
        c.name.trim().length > 40)
      return fail(400, 'تحقق من اسم كل لون.');

    const key = c.name.trim().toLowerCase();
    if (seenColors.has(key)) return fail(400, 'لا تكرر اسم اللون.');
    seenColors.add(key);

    let image = '';
    if (typeof c.field === 'string' && /^colorImage\d+$/.test(c.field)) {
      const file = filesByField.get(c.field);
      if (!file) return fail(400, 'تعذر العثور على صورة اللون الجديدة.');
      image = '/uploads/' + file.filename;
    } else if (typeof c.image === 'string' && oldImages.has(c.image)) {
      image = c.image;
    } else {
      return fail(400, `اختار صورة للون ${c.name.trim()}.`);
    }

    colors.push({ name: c.name.trim(), image });
  }

  if (filesByField.size !== uploaded.length)
    return fail(400, 'ملفات الصور المرفوعة غير صالحة.');

  try {
    const result = db.prepare(`
      UPDATE products
      SET name = ?, description = ?, price = ?, image = ?, stock = ?,
          sizes = ?, colors = ?, category = ?
      WHERE id = ?
    `).run(
      name.trim(),
      String(description).slice(0, 2000),
      numericPrice,
      colors[0].image,
      numericStock,
      JSON.stringify(sizes),
      JSON.stringify(colors),
      category,
      id
    );

    if (!result.changes) return fail(404, 'المنتج غير موجود.');

    const keptImages = new Set(colors.map(c => c.image));
    for (const image of oldImages) {
      if (image.startsWith('/uploads/') && !keptImages.has(image)) {
        const filePath = path.join(__dirname, image);
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
      }
    }

    res.json({ ok: true, id });
  } catch (error) {
    cleanup();
    console.error('تعذر تعديل المنتج:', error.message);
    return res.status(500).json({ error: 'تعذر حفظ التعديلات.' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'رقم المنتج غير صحيح.' });
  }

  const product = db.prepare('SELECT image FROM products WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود.' });

  db.prepare('DELETE FROM products WHERE id = ?').run(id);

  if (product.image && product.image.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, product.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all());
});

app.patch('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const allowed = ['جديد', 'قيد التجهيز', 'تم الشحن', 'مكتمل', 'ملغي'];
  const { status } = req.body || {};

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'حالة الطلب غير صحيحة.' });
  }

  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?')
    .run(status, Number(req.params.id));

  if (!result.changes) return res.status(404).json({ error: 'الطلب غير موجود.' });
  res.json({ ok: true });
});

// إنشاء حساب المدير مرة واحدة من بيانات .env
const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
if (adminCount === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
  const password = process.env.ADMIN_PASSWORD;
  if (password.length < 12) {
    console.error('كلمة مرور المدير يجب أن تكون 12 حرفًا على الأقل.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .run(process.env.ADMIN_USERNAME, hash);
  console.log('تم إنشاء حساب المدير الأول.');
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'تعذر رفع الصورة أو تجاوز حجمها 5MB.' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'حدث خطأ.' });
  }
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TOBA STORE يعمل محليًا على http://127.0.0.1:${PORT}`);
});
