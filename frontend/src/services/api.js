import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('femcs_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('femcs_token');
      localStorage.removeItem('femcs_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  getUsers: (params) => api.get('/auth/users', { params }),
  toggleUser: (id) => api.patch(`/auth/users/${id}/toggle`),
  updateRole: (id, role) => api.patch(`/auth/users/${id}/role`, { role }),
};

export const customerAPI = {
  create: (data) => api.post('/customers', data),
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const extinguisherAPI = {
  create: (data) => api.post('/extinguishers', data),
  list: (params) => api.get('/extinguishers', { params }),
  get: (id) => api.get(`/extinguishers/${id}`),
  update: (id, data) => api.put(`/extinguishers/${id}`, data),
  delete: (id) => api.delete(`/extinguishers/${id}`),
  stats: () => api.get('/extinguishers/stats'),
};

export const inspectionAPI = {
  create: (data) => api.post('/inspections', data),
  list: (params) => api.get('/inspections', { params }),
  get: (id) => api.get(`/inspections/${id}`),
};

export const maintenanceAPI = {
  create: (data) => api.post('/maintenance', data),
  list: (params) => api.get('/maintenance', { params }),
  get: (id) => api.get(`/maintenance/${id}`),
  updateStatus: (id, status) => api.patch(`/maintenance/${id}/status`, { status }),
};

export const notificationAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  getEscalations: (params) => api.get('/notifications/escalations', { params }),
  resolveEscalation: (id, notes) => api.patch(`/notifications/escalations/${id}/resolve`, { notes }),
  triggerCheck: () => api.post('/notifications/trigger-check'),
};

export const reportAPI = {
  expired: (params) => api.get('/reports/expired', { params }),
  expiringSoon: (params) => api.get('/reports/expiring-soon', { params }),
  customers: (params) => api.get('/reports/customers', { params }),
  inspections: (params) => api.get('/reports/inspections', { params }),
  maintenance: (params) => api.get('/reports/maintenance', { params }),
  compliance: (params) => api.get('/reports/compliance', { params }),
  audit: (params) => api.get('/reports/audit', { params }),
  summary: () => api.get('/reports/summary'),
  downloadCsv: (type, params) => api.get(`/reports/${type}`, { params: { ...params, format: 'csv' }, responseType: 'blob' }),
};

export default api;
