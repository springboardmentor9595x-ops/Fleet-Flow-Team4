import api from "./axios";

export const getFuelRecords = () => api.get("/fuel/");
export const createFuelRecord = (data) => api.post("/fuel/", data);
export const updateFuelRecord = (id, data) => api.put(`/fuel/${id}`, data);
export const deleteFuelRecord = (id) => api.delete(`/fuel/${id}`);
