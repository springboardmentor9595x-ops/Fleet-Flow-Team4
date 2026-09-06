import api from "./axios";

export const getFleetUtilizationReport = (params) =>
  api.get("/reports/fleet-utilization", { params });

export const getFuelConsumptionReport = (params) =>
  api.get("/reports/fuel-consumption", { params });

export const getDriverPerformanceReport = (params) =>
  api.get("/reports/driver-performance", { params });

export const getDeliveryPerformanceReport = (params) =>
  api.get("/reports/delivery-performance", { params });

export const getMaintenanceReport = (params) =>
  api.get("/reports/maintenance", { params });

export const downloadReportFile = async (endpoint, format, params, filename) => {
  const response = await api.get(endpoint, {
    params: { ...params, export: format },
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filename}.${format === "pdf" ? "pdf" : "xlsx"}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
