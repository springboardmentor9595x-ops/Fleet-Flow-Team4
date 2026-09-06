import api from "./axios";

export const getDrivers = () => api.get("/drivers/");
export const createDriver = (data) => api.post("/drivers/", data);
export const updateDriver = (id, data) => api.put(`/drivers/${id}`, data);
export const deleteDriver = (id) => api.delete(`/drivers/${id}`);
export const assignDriver = (id, data) => api.put(`/drivers/${id}/assign`, data);
export const unassignDriver = (id) => api.put(`/drivers/${id}/unassign`);

