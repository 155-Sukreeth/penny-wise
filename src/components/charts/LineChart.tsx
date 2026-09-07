interface LineChartProps {
  data: { label: string; value: number; secondaryValue?: number }[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  fillOpacity?: number;
  formatValue?: (v: number) => string;
}

export function LineChart({
  data,
  height = 200,
  color = "#3b82f6",
  secondaryColor = "#e2e8f0",
  fillOpacity = 0.08,
  formatValue,
}: LineChartProps) {
  const width = 600;
  const padding = { top: 20, right: 10, bottom: 30, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue || 0)), 1);
  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartHeight - (d.value / maxValue) * chartHeight,
    secondaryY: padding.top + chartHeight - ((d.secondaryValue || 0) / maxValue) * chartHeight,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${padding.left + (data.length - 1) * stepX} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
  const secondaryPathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.secondaryY}`).join(" ");

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={fillOpacity * 3} />
            <stop offset="100%" stopColor={color} stopOpacity={fillOpacity} />
          </linearGradient>
        </defs>
        {data.length > 1 && (
          <>
            {data.some((d) => d.secondaryValue !== undefined) && (
              <path d={secondaryPathD} fill="none" stroke={secondaryColor} strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
            )}
            <path d={areaD} fill={`url(#gradient-${color.replace("#", "")})`} />
            <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={2} />
                {formatValue && data[i].value > 0 && (
                  <title>{formatValue(data[i].value)}</title>
                )}
              </g>
            ))}
          </>
        )}
      </svg>
      <div className="flex items-start justify-between mt-1 px-1">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-gray-500 font-medium text-center flex-1 truncate">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
