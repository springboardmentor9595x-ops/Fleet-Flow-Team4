import { useEffect, useState } from "react";
import { getShipmentHistory, updateShipmentStatus, cancelShipment } from "../api/shipments";

const STEPPER_STAGES = ["Created", "Assigned", "In Transit", "Delivered"];

const STATUS_COLORS = {
  Created: "bg-slate-500/20 text-slate-300 border-slate-700",
  Assigned: "bg-blue-500/20 text-blue-400 border-blue-800",
  "In Transit": "bg-purple-500/20 text-purple-400 border-purple-800",
  Delayed: "bg-yellow-500/20 text-yellow-400 border-yellow-800",
  Delivered: "bg-green-500/20 text-green-400 border-green-800",
  Cancelled: "bg-red-500/20 text-red-400 border-red-800",
};

export default function ShipmentDetailModal({ shipment, onClose, onRefresh, canManage }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const res = await getShipmentHistory(shipment.shipment_id);
      setHistory(res.data);
    } catch (err) {
      setError("Failed to load status history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shipment) {
      loadHistory();
    }
  }, [shipment]);

  const handleStatusUpdate = async (nextStatus) => {
    try {
      setUpdating(true);
      await updateShipmentStatus(shipment.shipment_id, {
        status: nextStatus,
        location: `Updated via detail timeline`,
      });
      loadHistory();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this shipment?")) return;
    try {
      setUpdating(true);
      await cancelShipment(shipment.shipment_id);
      loadHistory();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to cancel shipment");
    } finally {
      setUpdating(false);
    }
  };

  if (!shipment) return null;

  // Determine current active index in stepper
  const currentStepIndex = STEPPER_STAGES.indexOf(shipment.status);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-white space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold font-mono text-cyan-400">
                {shipment.tracking_number}
              </h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[shipment.status] || "bg-slate-800 text-slate-300"}`}>
                {shipment.status}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Customer: <span className="text-white font-medium">{shipment.customer_name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/60"
          >
            ✕
          </button>
        </div>

        {/* Visual Delivery Stepper */}
        {shipment.status !== "Cancelled" && (
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Delivery Progress Stepper
            </h4>
            <div className="flex items-center justify-between relative">
              {/* Stepper Progress Bar */}
              <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-800 -translate-y-1/2 z-0" />
              
              {STEPPER_STAGES.map((stage, idx) => {
                const isPassed = currentStepIndex >= 0 && idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;

                return (
                  <div key={stage} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isCurrent
                          ? "bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/30 scale-110"
                          : isPassed
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      {isPassed ? "✓" : idx + 1}
                    </div>
                    <span className={`text-[11px] mt-2 font-medium ${isCurrent ? "text-cyan-400 font-bold" : isPassed ? "text-slate-200" : "text-slate-500"}`}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800 text-xs">
          <div>
            <span className="text-slate-400">Source</span>
            <p className="font-semibold text-white mt-0.5">{shipment.source}</p>
          </div>
          <div>
            <span className="text-slate-400">Destination</span>
            <p className="font-semibold text-white mt-0.5">{shipment.destination}</p>
          </div>
          <div>
            <span className="text-slate-400">Weight</span>
            <p className="font-semibold text-white mt-0.5">{shipment.shipment_weight} kg</p>
          </div>
          <div>
            <span className="text-slate-400">Expected Delivery</span>
            <p className="font-semibold text-white mt-0.5">
              {shipment.expected_delivery_at
                ? new Date(shipment.expected_delivery_at).toLocaleString()
                : "Not set"}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Assigned Vehicle</span>
            <p className="font-semibold text-cyan-400 mt-0.5">
              {shipment.vehicle_id ? shipment.vehicle_id.slice(0, 8) + "..." : "Unassigned"}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Assigned Driver</span>
            <p className="font-semibold text-cyan-400 mt-0.5">
              {shipment.driver_id ? shipment.driver_id.slice(0, 8) + "..." : "Unassigned"}
            </p>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* Action Controls for Driver / Dispatcher */}
        {canManage && shipment.status !== "Delivered" && shipment.status !== "Cancelled" && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400 font-semibold mr-2">Quick Stage Updates:</span>
            {shipment.status === "Created" && (
              <button
                disabled={updating}
                onClick={() => handleStatusUpdate("Assigned")}
                className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-700/50 rounded-lg hover:bg-blue-500/30 text-xs font-semibold"
              >
                Mark Assigned
              </button>
            )}
            {shipment.status === "Assigned" && (
              <button
                disabled={updating}
                onClick={() => handleStatusUpdate("In Transit")}
                className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-700/50 rounded-lg hover:bg-purple-500/30 text-xs font-semibold"
              >
                Mark In Transit
              </button>
            )}
            {shipment.status === "In Transit" && (
              <button
                disabled={updating}
                onClick={() => handleStatusUpdate("Delivered")}
                className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-700/50 rounded-lg hover:bg-green-500/30 text-xs font-semibold"
              >
                Mark Delivered
              </button>
            )}
            <button
              disabled={updating}
              onClick={handleCancel}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-700/50 rounded-lg hover:bg-red-500/30 text-xs font-semibold ml-auto"
            >
              Cancel Shipment
            </button>
          </div>
        )}

        {/* Status History Lifecycle Timeline */}
        <div>
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <span>📜</span> Status History & Audit Timeline
          </h4>
          {loading ? (
            <p className="text-xs text-slate-500">Loading history timeline...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-500">No status changes logged yet.</p>
          ) : (
            <div className="relative pl-6 space-y-4 border-l border-slate-800">
              {history.map((h) => (
                <div key={h.history_id} className="relative group">
                  {/* Timeline node */}
                  <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-cyan-500 border-2 border-slate-900" />
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-xs text-cyan-300">{h.status}</span>
                      {h.location && (
                        <p className="text-xs text-slate-400">{h.location}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(h.changed_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
