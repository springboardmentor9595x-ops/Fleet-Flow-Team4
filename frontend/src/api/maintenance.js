import api from "./axios";

export const getMaintenance = () => api.get("/maintenance/");
export const getMaintenanceRecords = () => api.get("/maintenance/");
export const createMaintenance = (data) => api.post("/maintenance/", data);
export const updateMaintenance = (id, data) => api.put(`/maintenance/${id}`, data);
export const deleteMaintenance = (id) => api.delete(`/maintenance/${id}`);
