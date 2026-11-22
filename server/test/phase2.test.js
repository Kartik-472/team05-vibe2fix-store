const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/config/db');
const db = {};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const products = require('../src/services/product.service');
const orders = require('../src/services/order.service');
const cart = require('../src/services/cart.service');
const { checkCoupon } = require('../src/services/commerce.service');
const verification = require('../src/services/emailVerification.service');
const requireAuth = require('../src/middleware/requireAuth');
const requireAdmin = require('../src/middleware/requireAdmin');
const { tokenDigest } = require('../src/utils/tokenDigest');
const arrayTransaction = queries => Promise.all(queries);
const expectStatus = code => err => err.statusCode === code;

test('catalog binds search and preserves filters, sorting, selected fields and pagination', async () => {
  let captured;
  db.$transaction = arrayTransaction;
  db.product = { findMany: q => { captured = q; return []; }, count: () => 120 };
  const catalog = await products.getProducts({ search: "Maker's kit", sort: 'price_desc', limit: '120', page: '2' });
  assert.deepEqual(captured.where, { isActive: true, name: { contains: "Maker's kit", mode: 'insensitive' } });
  assert.deepEqual(captured.orderBy[0], { price: 'desc' });
  assert.equal(captured.take, 100);
  assert.equal(captured.skip, 100);
  assert.equal(captured.select.costPrice, undefined);
  assert.equal(catalog.pagination.pages, 2);
  await assert.rejects(products.getProducts({ sort: 'unsupported' }), expectStatus(400));
});

test('product detail has a public field selection and no supplier or cost properties', async () => {
  db.product = { findFirst: q => {
    assert.deepEqual(q.where, { id: 'p', isActive: true });
    assert.equal(q.select.supplierEmail, undefined);
    return { id: 'p', price: 100, reviews: [] };
  } };
  assert.deepEqual(await products.getProductById('p'), { id: 'p', price: 100, reviews: [] });
});

test('cart mutations reject invalid quantities before any database change', async () => {
  for (const quantity of [0, -1, '0', '1.5', false, [2], null, 2147483648]) {
    await assert.rejects(cart.addToCart('buyer', 'item', quantity), expectStatus(400));
    await assert.rejects(cart.updateQuantity('buyer', 'item', quantity), expectStatus(400));
  }
  assert.equal(cart.positiveQuantity('2'), 2);
});

test('checkout rejects a previously saved invalid item before changing stock', async () => {
  db.$transaction = cb => cb({ cart: { findUnique: async () => ({ items: [{ quantity: -1 }] }) } });
  await assert.rejects(orders.placeOrder('buyer', 'address'), expectStatus(400));
});

test('cash on delivery checkout produces an order visible in the owner’s paginated history', async () => {
  const saved = [];
  db.order = {
    findMany: ({ where, skip, take }) => saved.filter(x => x.userId === where.userId).slice(skip, skip + take),
    count: ({ where }) => saved.filter(x => x.userId === where.userId).length,
    findFirst: ({ where }) => saved.find(x => x.userId === where.userId && x.orderNumber === where.orderNumber),
    findUnique: () => null,
    create: ({ data }) => { const row = { ...data, id: 'order' }; saved.push(row); return row; },
  };
  db.$transaction = (arg, options) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    assert.equal(options.isolationLevel, 'Serializable');
    return arg({ order: db.order,
      cart: { findUnique: () => ({ id: 'cart', items: [{ productId: 'p', quantity: 2, product: { name: 'P', price: 30, images: [] } }] }), update: () => ({}) },
      address: { findFirst: () => ({ name: 'Customer' }) },
      product: { updateMany: () => ({ count: 1 }) }, cartItem: { deleteMany: () => ({}) },
    });
  };
  const order = await orders.placeOrder('owner', 'address');
  assert.equal(order.totalAmount, 110);
  assert.equal((await orders.listOrders('owner', { page: '1', limit: '10' })).orders[0].id, order.id);
  assert.equal((await orders.listOrders('other', { userId: 'owner' })).total, 0);
  await assert.rejects(orders.getOrder('other', order.orderNumber), expectStatus(404));
  assert.equal((await orders.getOrder('owner', order.orderNumber)).id, order.id);
  await assert.rejects(orders.listOrders('owner', { limit: -1 }), expectStatus(400));
});

test('only an authenticated administrator passes the admin guard', () => {
  for (const role of ['user', 'admin']) {
    const req = { user: { role }, headers: {} };
    requireAdmin(req, {}, err => assert.equal(err?.statusCode, role === 'admin' ? undefined : 403));
  }
});

test('authentication requires a current database session; deleting it revokes access', async () => {
  const token = 'a'.repeat(64);
  const sessions = new Map([[tokenDigest(token), { expiresAt: new Date(Date.now() + 60_000), user: { id: 'owner', isActive: true } }]]);
  db.session = { findUnique: ({ where }) => sessions.get(where.tokenHash) };
  const authenticate = req => new Promise((resolve, reject) => requireAuth(req, {}, err => err ? reject(err) : resolve(req)));
  const req = { headers: { authorization: 'Bearer ' + token } };
  assert.equal((await authenticate(req)).user.id, 'owner');
  sessions.delete(req.sessionTokenHash);
  await assert.rejects(authenticate(req), expectStatus(401));
  await assert.rejects(authenticate({ headers: {} }), expectStatus(401));
});

test('welcome discounts require a verified account and available redemption', async () => {
  const coupon = { id: 'c', code: 'WELCOME_LIMITED', isActive: true, expiry: new Date(Date.now() + 60000), minOrder: 10, usageLimit: 1 };
  const client = { coupon: { findUnique: () => coupon }, user: { findUnique: () => ({ emailVerifiedAt: null }) },
    couponUsage: { findUnique: () => null, count: () => 0 } };
  await assert.rejects(checkCoupon(client, 'buyer', coupon.code, 50), expectStatus(403));
  client.user.findUnique = () => ({ emailVerifiedAt: new Date() });
  assert.equal((await checkCoupon(client, 'buyer', coupon.code, 50)).id, 'c');
  client.couponUsage.count = () => 1;
  await assert.rejects(checkCoupon(client, 'buyer', coupon.code, 50), expectStatus(400));
});

test('email verification binds a single-use, expiring code to the signed-in user', async () => {
  const code = 'b'.repeat(24);
  let used = false;
  db.user = { updateMany: ({ where, data }) => {
    assert.equal(where.id, 'buyer');
    assert.equal(where.verifyTokenHash, tokenDigest(code));
    assert.ok(where.verifyExpiresAt.gt instanceof Date);
    assert.equal(data.verifyTokenHash, null);
    const count = used ? 0 : 1;
    used = true;
    return { count };
  } };
  await verification.confirmCode({ id: 'buyer' }, code);
  await assert.rejects(verification.confirmCode({ id: 'buyer' }, code), expectStatus(400));
});
