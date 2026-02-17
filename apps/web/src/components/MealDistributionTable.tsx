import type { EquivalentBucketPlanV2, MealDistributionPlan } from '@equivalentes/shared';

type MealDistributionTableProps = {
  mealDistribution: MealDistributionPlan;
  bucketPlan: EquivalentBucketPlanV2[];
};

export const MealDistributionTable = ({
  mealDistribution,
  bucketPlan,
}: MealDistributionTableProps): JSX.Element => {
  if (!mealDistribution || mealDistribution.length === 0) {
    return <></>;
  }

  const activeBuckets = bucketPlan.filter((bucket) => bucket.exchangesPerDay > 0);

  const mealTotals = mealDistribution.map((slot) => {
    let totalExchanges = 0;
    for (const bucket of activeBuckets) {
      totalExchanges += slot.distribution[bucket.bucketKey] ?? 0;
    }
    return totalExchanges;
  });

  return (
    <div>
      <h3 className="mb-2 text-lg font-extrabold text-ink">
        Distribucion por comida
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Equivalentes sugeridos por bucket para cada comida del dia.
        Los valores se calculan automaticamente segun tu objetivo y numero de comidas.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-sky/12 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-sky/10 bg-gradient-to-r from-sky-50/60 to-white text-left">
              <th className="py-3 pl-4 pr-3 font-bold text-ink">Grupo</th>
              {mealDistribution.map((slot) => (
                <th
                  key={slot.name}
                  className="px-3 py-3 text-center font-bold text-ink"
                >
                  {slot.name}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-bold text-sky-700">
                Total/dia
              </th>
            </tr>
          </thead>
          <tbody>
            {activeBuckets.map((bucket) => {
              const dailyTotal = bucket.exchangesPerDay;
              return (
                <tr
                  key={bucket.bucketKey}
                  className="border-b border-sky/6 transition hover:bg-sky-50/30"
                >
                  <td className="py-2.5 pl-4 pr-3 font-semibold text-ink">
                    {bucket.bucketName}
                  </td>
                  {mealDistribution.map((slot) => {
                    const value = slot.distribution[bucket.bucketKey] ?? 0;
                    return (
                      <td
                        key={slot.name}
                        className={`px-3 py-2.5 text-center tabular-nums ${value > 0 ? 'text-ink' : 'text-slate-300'}`}
                      >
                        {value > 0 ? value : '-'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums text-sky-700">
                    {dailyTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-sky/15 bg-gradient-to-r from-sky-50/40 to-white">
              <td className="py-2.5 pl-4 pr-3 text-xs font-bold uppercase tracking-wider text-slate-600">
                Total equiv.
              </td>
              {mealTotals.map((total, index) => (
                <td
                  key={mealDistribution[index]?.name ?? index}
                  className="px-3 py-2.5 text-center font-bold tabular-nums text-sky-700"
                >
                  {total}
                </td>
              ))}
              <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-sky-800">
                {activeBuckets.reduce((sum, bucket) => sum + bucket.exchangesPerDay, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
