const prisma = require('../config/db');
const AppError = require('../utils/AppError');
const { cartTotals, getOrCreateCart, checkCoupon } = require('./commerce.service');

const cartInclude = { coupon: true, items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } } };

function positiveQuantity(value) {
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw new AppError('Quantity must be a positive integer', 400);
  return n;
}

async function getCart(userId) {
  const cart = await getOrCreateCart(prisma, userId);
  const full = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  const items = full.items.map(({ product, ...item }) => ({ ...item, product, isAvailable: product.isActive && product.stock >= item.quantity }));
  return { id: full.id, items, coupon: full.coupon, ...cartTotals(full) };
}

async function addToCart(userId, productId, quantity = 1) {
  quantity = positiveQuantity(quantity);
  try {
    await prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product?.isActive) throw new AppError('Product not found or unavailable', 404);
      const cart = await getOrCreateCart(tx, userId);
      const key = { cartId_productId: { cartId: cart.id, productId } };
      const current = await tx.cartItem.findUnique({ where: key });
      const nextQty = Math.max(current?.quantity || 0, 0) + quantity;
      if (nextQty > product.stock) throw new AppError('Requested quantity exceeds available stock', 409);
      await tx.cartItem.upsert({ where: key, create: { cartId: cart.id, productId, quantity }, update: { quantity: nextQty } });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['P2002', 'P2034'].includes(error.code)) throw new AppError('Cart changed. Please retry.', 409);
    throw error;
  }
  return getCart(userId);
}

async function updateQuantity(userId, productId, quantity) {
  quantity = positiveQuantity(quantity);
  const cart = await getOrCreateCart(prisma, userId);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) throw new AppError('Product not found or unavailable', 404);
  if (quantity > product.stock) throw new AppError('Requested quantity exceeds available stock', 409);
  const result = await prisma.cartItem.updateMany({ where: { cartId: cart.id, productId }, data: { quantity } });
  if (!result.count) throw new AppError('Cart item not found', 404);
  return getCart(userId);
}

async function removeItem(userId, productId) {
  const cart = await getOrCreateCart(prisma, userId);
  const result = await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
  if (!result.count) throw new AppError('Cart item not found', 404);
  return getCart(userId);
}

async function applyCoupon(userId, code) {
  const cart = await getOrCreateCart(prisma, userId);
  const full = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  const subtotal = cartTotals(full).subtotal;
  const coupon = await checkCoupon(prisma, userId, code, subtotal);
  await prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
  return getCart(userId);
}

async function removeCoupon(userId) {
  const cart = await getOrCreateCart(prisma, userId);
  await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
  return getCart(userId);
}

module.exports = { positiveQuantity, getCart, addToCart, updateQuantity, removeItem, applyCoupon, removeCoupon };
