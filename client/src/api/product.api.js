import client from './client';

export const productApi = {
  getProducts: (params = {}) => client.get('/api/products', { params, preserveEnvelope: true }),
  getProductById: (id) => client.get(`/api/products/${id}`),
  getProductReviews: (id, params = {}) => client.get(`/api/products/${id}/reviews`, { params }),
};

export const categoryApi = {
  getCategories: () => client.get('/api/categories'),
};
