import api from './axios';

export const getProfile = () => api.get('/auth/me');

export const updateProfile = (data) => api.put('/auth/me', data);

export const getAdminUsers = () => api.get('/auth/users');

export const updateUserRole = (userId, role) =>
  api.put(`/auth/users/${userId}/role`, { role });

