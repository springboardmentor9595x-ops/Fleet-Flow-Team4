import api from "./axios";

export const getShipments = () => api.get("/shipments/");
export const getShipment = (id) => api.get(`/shipments/${id}`);
export const createShipment = (data) => api.post("/shipments/", data);
export const updateShipment = (id, data) => api.put(`/shipments/${id}`, data);
export const deleteShipment = (id) => api.delete(`/shipments/${id}`);
export const getShipmentHistory = (id) => api.get(`/shipments/${id}/history`);