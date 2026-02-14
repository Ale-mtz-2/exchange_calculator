type MacroPieChartProps = {
  carbsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal?: number;
};

const COLORS = {
  carbs: '#2e86c1',
  protein: '#0f8bff',
  fat: '#67b6df',
} as const;

const round = (value: number, digits = 1): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

export const MacroPieChart = ({
  carbsG,
  proteinG,
  fatG,
  caloriesKcal,
}: MacroPieChartProps): JSX.Element => {
  const carbKcal = Math.max(0, carbsG) * 4;
  const proteinKcal = Math.max(0, proteinG) * 4;
  const fatKcal = Math.max(0, fatG) * 9;
  const totalKcal = carbKcal + proteinKcal + fatKcal;

  const segments = [
    { key: 'carbs', label: 'Carbohidratos', value: carbKcal, color: COLORS.carbs },
    { key: 'protein', label: 'Proteina', value: proteinKcal, color: COLORS.protein },
    { key: 'fat', label: 'Grasa', value: fatKcal, color: COLORS.fat },
  ] as const;

  const size = 180;
  const radius = 60;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  let offsetAccumulator = 0;

  return (
    <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Distribucion de macros
      </p>
      <div className="mt-3 flex items-center gap-4">
        <svg aria-label="Grafico de pastel de macronutrientes" className="h-44 w-44 shrink-0" viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {segments.map((segment) => {
              const ratio = totalKcal > 0 ? segment.value / totalKcal : 0;
              const dash = circumference * ratio;
              const circle = (
                <circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  fill="none"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAccumulator}
                  strokeLinecap="butt"
                  strokeWidth={strokeWidth}
                />
              );

              offsetAccumulator += dash;
              return circle;
            })}
          </g>
          <circle cx={size / 2} cy={size / 2} fill="white" r={38} />
          <text
            fill="#182f50"
            fontSize="16"
            fontWeight="700"
            textAnchor="middle"
            x={size / 2}
            y={size / 2 - 2}
          >
            {round(totalKcal, 0)}
          </text>
          <text
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            x={size / 2}
            y={size / 2 + 13}
          >
            kcal
          </text>
        </svg>

        <div className="space-y-2">
          {segments.map((segment) => {
            const ratio = totalKcal > 0 ? (segment.value / totalKcal) * 100 : 0;
            return (
              <div key={segment.key} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="font-semibold text-ink">{segment.label}</span>
                <span>{round(ratio)}%</span>
              </div>
            );
          })}
          {typeof caloriesKcal === 'number' ? (
            <p className="pt-1 text-[11px] text-slate-500">Referencia del plan: {round(caloriesKcal, 0)} kcal</p>
          ) : null}
        </div>
      </div>
    </article>
  );
};
