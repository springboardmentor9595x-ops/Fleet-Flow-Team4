import api from "./axios";

export const getTrips = (status) => {
  const params = status ? { trip_status: status } : {};
  return api.get("/trips/", { params });
};

export const getTrip = (id) => api.get(`/trips/${id}`);

export const createTrip = (data) => api.post("/trips/", data);

export const updateTrip = (id, data) => api.put(`/trips/${id}`, data);

export const deleteTrip = (id) => api.delete(`/trips/${id}`);

export const startTrip = (id) => api.post(`/trips/${id}/start`);

export const completeTrip = (id) => api.post(`/trips/${id}/complete`);

export const getTripTelemetry = (id) => api.get(`/trips/${id}/telemetry`);

export const getActivePositions = () => api.get("/gps/active");

export const fetchRouteOptions = (data) => api.post("/trips/route-options", data);

export const recalculateTripRoute = (id, data) => api.post(`/trips/${id}/recalculate`, data);
