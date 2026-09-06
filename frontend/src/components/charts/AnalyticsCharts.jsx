import React from "react";

/**
 * Common Color Theme Constants:
 * Primary: #0F766E
 * Secondary: #14B8A6
 * Light Accent: #CCFBF1
 * Background: #F0FDFA
 * Cards: #FFFFFF
 * Text: #1F2937
 * Secondary Text: #6B7280
 * Border: #E5E7EB
 */

/**
 * Donut Chart using native SVG
 * @param {Array<{ label: string, value: number, color: string }>} data
 * @param {string} title
 * @param {string} centerLabel
 * @param {string|number} centerValue
 */
export function DonutChart({ data = [], title, centerLabel = "TOTAL", centerValue }) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const displayTotal = centerValue !== undefined ? centerValue : total;

  const radius = 60;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
      {title && (
        <h3 className="text-xs font-bold text-[#1F2937] font-mono uppercase tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]"></span>
          {title}
        </h3>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
        {/* SVG Donut */}
        <div className="relative w-36 h-36 flex items-center justify-center flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {/* Background Circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke="#F0FDFA"
              strokeWidth={strokeWidth}
            />

            {total > 0 &&
              data.map((item, idx) => {
                const percent = (item.value / total) * 100;
                const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                accumulatedPercent += percent;

                return (
                  <circle
                    key={idx}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke={item.color || "#0F766E"}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700 hover:opacity-85"
                  />
                );
              })}
          </svg>

          {/* Center Info */}
          <div className="absolute text-center select-none pointer-events-none">
            <span className="text-xl font-black text-[#1F2937] font-mono block leading-tight">
              {displayTotal}
            </span>
            <span className="text-[9px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">
              {centerLabel}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-1.5 w-full text-xs font-mono">
          {data.map((item, idx) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
            return (
              <div key={idx} className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color || "#0F766E" }}
                  ></span>
                  <span className="text-[#1F2937] truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-bold text-[#1F2937]">{item.value}</span>
                  <span className="text-[10px] text-[#6B7280] font-normal">({pct}%)</span>
                </div>
              </div>
            );
          })}
          {data.length === 0 && (
            <p className="text-[#6B7280] text-center py-2 text-xs">No records available</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal Bar Comparison Chart
 * @param {Array<{ label: string, value: number, formattedValue?: string, color?: string }>} data
 * @param {string} title
 */
export function HorizontalBarChart({ data = [], title }) {
  const maxValue = Math.max(...data.map((d) => Number(d.value) || 0), 1);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
      {title && (
        <h3 className="text-xs font-bold text-[#1F2937] font-mono uppercase tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]"></span>
          {title}
        </h3>
      )}

      <div className="space-y-3 pt-1">
        {data.map((item, idx) => {
          const widthPct = Math.min(((Number(item.value) || 0) / maxValue) * 100, 100);
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#1F2937] font-semibold truncate max-w-[160px]">
                  {item.label}
                </span>
                <span className="font-bold text-[#1F2937]">
                  {item.formattedValue !== undefined ? item.formattedValue : item.value}
                </span>
              </div>
              <div className="w-full bg-[#CCFBF1]/50 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full transition-all duration-700"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: item.color || "#0F766E",
                  }}
                ></div>
              </div>
            </div>
          );
        })}
        {data.length === 0 && (
          <p className="text-[#6B7280] text-center py-6 text-xs font-mono">
            No comparative records found
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Vertical Column Bar Chart
 * @param {Array<{ label: string, value: number, formattedValue?: string, color?: string }>} data
 * @param {string} title
 */
export function VerticalBarChart({ data = [], title }) {
  const maxValue = Math.max(...data.map((d) => Number(d.value) || 0), 1);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
      {title && (
        <h3 className="text-xs font-bold text-[#1F2937] font-mono uppercase tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]"></span>
          {title}
        </h3>
      )}

      <div className="flex items-end justify-between gap-2 h-36 pt-4 border-b border-[#E5E7EB] pb-2">
        {data.map((item, idx) => {
          const heightPct = Math.min(((Number(item.value) || 0) / maxValue) * 100, 100);
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
              <span className="text-[10px] font-mono text-[#6B7280] font-bold opacity-0 group-hover:opacity-100 transition truncate max-w-[50px]">
                {item.formattedValue || item.value}
              </span>
              <div className="w-full bg-[#CCFBF1]/40 rounded-t-lg h-28 flex items-end overflow-hidden">
                <div
                  className="w-full rounded-t-lg transition-all duration-700 hover:brightness-110"
                  style={{
                    height: `${Math.max(heightPct, 4)}%`,
                    backgroundColor: item.color || "#0F766E",
                  }}
                ></div>
              </div>
              <span className="text-[10px] font-mono text-[#6B7280] truncate max-w-[55px] text-center pt-1" title={item.label}>
                {item.label}
              </span>
            </div>
          );
        })}
        {data.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-[#6B7280] font-mono text-xs">
            No metrics logged yet
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Circular Metric Gauge
 * @param {number} value (0-100)
 * @param {string} title
 * @param {string} subtitle
 * @param {string} color
 */
export function MetricGauge({ value = 0, title, subtitle, color = "#0F766E" }) {
  const numValue = Math.min(Math.max(Number(value) || 0, 0), 100);
  const radius = 52;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (numValue / 100) * circumference;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between items-center text-center">
      {title && (
        <h3 className="text-xs font-bold text-[#1F2937] font-mono uppercase tracking-wider">
          {title}
        </h3>
      )}

      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke="#CCFBF1"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-2xl font-black text-[#1F2937] font-mono block leading-none">
            {numValue.toFixed(1)}%
          </span>
          <span className="text-[9px] font-mono text-[#6B7280] uppercase tracking-widest font-semibold mt-1 block">
            INDEX
          </span>
        </div>
      </div>

      {subtitle && (
        <p className="text-[11px] font-mono text-[#6B7280] max-w-[200px]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
