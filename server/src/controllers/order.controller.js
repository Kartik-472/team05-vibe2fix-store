const service = require('../services/order.service');
const asyncHandler = require('../utils/asyncHandler');
exports.place = asyncHandler(async (req, res) => res.status(201).json({ data: await service.placeOrder(req.user.id, req.body.addressId, req.body.couponCode) }));
exports.list = asyncHandler(async (req, res) => {
  const { orders, ...pagination } = await service.listOrders(req.user.id, req.query);
  res.json({ data: orders, ...pagination });
});
exports.get = asyncHandler(async (req, res) => res.json({ data: await service.getOrder(req.user.id, req.params.orderNumber) }));
exports.cancel = asyncHandler(async (req, res) => res.json({ data: await service.cancelOrder(req.user.id, req.params.orderNumber) }));
exports.updateStatus = asyncHandler(async (req, res) => res.json({ data: await service.updateStatus(req.params.id, req.body.status) }));
exports.listAll = asyncHandler(async (req, res) => res.json(await service.listAllOrders(req.query)));
