import client from './client';

export const addressApi = {
  getAddresses: () => client.get('/api/addresses'),
  addAddress: (data) => client.post('/api/addresses', data),
  updateAddress: (id, data) => client.put(`/api/addresses/${id}`, data),
  deleteAddress: (id) => client.delete(`/api/addresses/${id}`),
};

export const orderApi = {
  createOrder: (payload) => client.post('/api/orders', payload),
  getOrders: (params = {}) => client.get('/api/orders', { params, preserveEnvelope: true }),
  getOrderByNumber: (orderNumber) => client.get(`/api/orders/${orderNumber}`),
  cancelOrder: (orderNumber) => client.put(`/api/orders/${orderNumber}/cancel`),
  requestRefund: (orderNumber, data) => client.post(`/api/orders/${orderNumber}/refund`, data),
};

export const refundApi = {
  getMyRefunds: () => client.get('/api/refunds'),
};

export const reviewApi = {
  submitReview: (productId, formData) =>
    client.post(`/api/products/${productId}/reviews`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  editReview: (id, data) => client.put(`/api/reviews/${id}`, data),
  deleteReview: (id) => client.delete(`/api/reviews/${id}`),
  reportReview: (id, reportReason) => client.post(`/api/reviews/${id}/report`, { reason: reportReason }),
};
