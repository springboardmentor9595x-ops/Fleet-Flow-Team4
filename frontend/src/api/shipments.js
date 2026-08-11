import api from "./axios";

export const getShipments = (params) => api.get("/shipments/", { params });
export const getShipment = (id) => api.get(`/shipments/${id}`);
export const createShipment = (data) => api.post("/shipments/", data);
export const updateShipment = (id, data) => api.put(`/shipments/${id}`, data);
export const deleteShipment = (id) => api.delete(`/shipments/${id}`);
export const getShipmentHistory = (id) => api.get(`/shipments/${id}/history`);
export const getShipmentAlerts = () => api.get("/shipments/alerts");
export const updateShipmentStatus = (id, data) => api.post(`/shipments/${id}/status`, data);
export const cancelShipment = (id) => api.post(`/shipments/${id}/cancel`);
export const getUsers = () => api.get("/auth/users");

