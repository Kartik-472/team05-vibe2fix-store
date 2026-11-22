const AppError = require('../utils/AppError');

const welcomeCodes = ['WELCOME_LIMITED', 'WELCOME50'];

function calculateDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  const value = Number(coupon.value);
  const discount = coupon.type === 'percent' ? subtotal * value / 100 : value;
  return Math.min(subtotal, coupon.maxDiscount == null ? discount : Math.min(discount, Number(coupon.maxDiscount)));
}

function cartTotals(cart) {
  const subtotal = Number(cart.items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0).toFixed(2));
  const shippingCharge = subtotal >= 500 ? 0 : 50;
  const discount = calculateDiscount(cart.coupon, subtotal);
  return { subtotal, discount, shippingCharge, totalAmount: Number((subtotal - discount + shippingCharge).toFixed(2)) };
}

async function getOrCreateCart(client, userId) {
  return client.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}

async function checkCoupon(client, userId, code, subtotal) {
  const coupon = await client.coupon.findUnique({ where: { code: String(code).trim().toUpperCase() } });
  if (!coupon || !coupon.isActive || coupon.expiry <= new Date()) throw new AppError('Coupon is invalid or expired', 400);
  if (subtotal < Number(coupon.minOrder)) throw new AppError(`Minimum order amount is ${coupon.minOrder}`, 400);
  if (welcomeCodes.includes(coupon.code)) {
    const user = await client.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) throw new AppError('Verify your email in your profile to redeem the welcome discount.', 403);
  }
  const [used, count] = await Promise.all([
    client.couponUsage.findUnique({ where: { couponId_userId: { couponId: coupon.id, userId } } }),
    client.couponUsage.count({ where: { couponId: coupon.id } }),
  ]);
  if (used) throw new AppError('Coupon already used', 400);
  if (count >= coupon.usageLimit) throw new AppError('Coupon usage limit reached', 400);
  return coupon;
}

module.exports = { welcomeCodes, calculateDiscount, cartTotals, getOrCreateCart, checkCoupon };
