interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ data, size = 180, thickness = 28, centerLabel, centerValue }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total > 0 ? d.value / total : 0;
      const dash = fraction * circumference;
      const segment = {
        ...d,
        dash,
        gap: circumference - dash,
        offset: offset * circumference,
        fraction,
      };
      offset += fraction;
      return segment;
    });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-gray-100"
        />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        ))}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-xl font-bold text-gray-900">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-gray-500 mt-0.5">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
