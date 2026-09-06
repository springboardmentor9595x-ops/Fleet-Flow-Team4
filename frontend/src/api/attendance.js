import api from "./axios";

export const markAttendance = (data) => api.post("/attendance/", data);
export const listAttendance = (params) => api.get("/attendance/", { params });
export const getDriverAttendanceHistory = (driverId) => api.get(`/attendance/driver/${driverId}`);
export const getAttendanceSummary = (params) => api.get("/attendance/summary", { params });

export const applyLeave = (data) => api.post("/attendance/leave-requests", data);
export const listLeaveRequests = () => api.get("/attendance/leave-requests");
export const reviewLeaveRequest = (requestId, data) =>
  api.patch(`/attendance/leave-requests/${requestId}/status`, data);

export const rateDriver = (data) => api.post("/attendance/driver-ratings", data);
export const getDriverRatings = (driverId) =>
  api.get("/attendance/driver-ratings", { params: driverId ? { driver_id: driverId } : {} });

