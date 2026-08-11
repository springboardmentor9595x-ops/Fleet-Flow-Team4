import api from "./axios";

export const getVehicles = () => api.get("/vehicles/");
export const getVehicleStatusCounts = () => api.get("/vehicles/status-counts");
export const getVehicle = (id) => api.get(`/vehicles/${id}`);
export const createVehicle = (data) => api.post("/vehicles/", data);
export const updateVehicle = (id, data) => api.put(`/vehicles/${id}`, data);
export const deleteVehicle = (id) => api.delete(`/vehicles/${id}`);