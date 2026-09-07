interface BarChartProps {
  data: { label: string; value: number; color?: string; secondaryValue?: number; secondaryColor?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  showSecondary?: boolean;
}

export function BarChart({ data, height = 200, formatValue, showSecondary }: BarChartProps) {
  const maxValue = Math.max(
    ...data.map((d) => showSecondary ? Math.max(d.value, d.secondaryValue || 0) : d.value),
    1
  );

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full group">
            {showSecondary && d.secondaryValue !== undefined && (
              <div
                className="w-full max-w-[32px] rounded-t-sm transition-all duration-500 hover:opacity-80 relative"
                style={{
                  height: `${(d.secondaryValue / maxValue) * 100}%`,
                  backgroundColor: d.secondaryColor || "#cbd5e1",
                }}
              />
            )}
            <div
              className="w-full max-w-[32px] rounded-t-md transition-all duration-500 hover:opacity-80 cursor-default relative"
              style={{
                height: `${(d.value / maxValue) * 100}%`,
                backgroundColor: d.color || "#3b82f6",
                minHeight: d.value > 0 ? "4px" : "0",
              }}
            >
              {formatValue && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-10">
                  {formatValue(d.value)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start justify-between gap-2 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-gray-500 font-medium leading-tight block">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
