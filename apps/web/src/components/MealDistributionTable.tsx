import type { EquivalentGroupPlan, MealDistributionPlan } from '@equivalentes/shared';

type MealDistributionTableProps = {
    mealDistribution: MealDistributionPlan;
    groupPlan: EquivalentGroupPlan[];
};

/**
 * Renders a table showing how food-group equivalents are distributed across meals.
 * Rows = food groups, Columns = meals (Desayuno, Colación AM, Comida, etc.)
 */
export const MealDistributionTable = ({
    mealDistribution,
    groupPlan,
}: MealDistributionTableProps): JSX.Element => {
    if (!mealDistribution || mealDistribution.length === 0) {
        return <></>;
    }

    // Build a map of group code → display name from the plan
    const groupNameMap = new Map<string, string>();
    for (const g of groupPlan) {
        groupNameMap.set(g.groupCode, g.groupName);
    }

    // Filter out groups that have 0 total exchanges
    const activeGroups = groupPlan.filter((g) => g.exchangesPerDay > 0);

    // Compute column totals (kcal approximation per meal)
    const mealTotals = mealDistribution.map((slot) => {
        let totalExchanges = 0;
        for (const g of activeGroups) {
            totalExchanges += slot.distribution[g.groupCode] ?? 0;
        }
        return totalExchanges;
    });

    return (
        <div>
            <h3 className="mb-2 text-lg font-extrabold text-ink">
                Distribucion por comida
            </h3>
            <p className="mb-3 text-xs text-slate-500">
                Equivalentes sugeridos por grupo para cada comida del dia.
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
                        {activeGroups.map((group) => {
                            const dailyTotal = group.exchangesPerDay;
                            return (
                                <tr
                                    key={group.groupCode}
                                    className="border-b border-sky/6 transition hover:bg-sky-50/30"
                                >
                                    <td className="py-2.5 pl-4 pr-3 font-semibold text-ink">
                                        {group.groupName}
                                    </td>
                                    {mealDistribution.map((slot) => {
                                        const val = slot.distribution[group.groupCode] ?? 0;
                                        return (
                                            <td
                                                key={slot.name}
                                                className={`px-3 py-2.5 text-center tabular-nums ${val > 0 ? 'text-ink' : 'text-slate-300'
                                                    }`}
                                            >
                                                {val > 0 ? val : '–'}
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
                            {mealTotals.map((total, i) => (
                                <td
                                    key={mealDistribution[i]?.name ?? i}
                                    className="px-3 py-2.5 text-center font-bold tabular-nums text-sky-700"
                                >
                                    {total}
                                </td>
                            ))}
                            <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-sky-800">
                                {activeGroups.reduce((s, g) => s + g.exchangesPerDay, 0)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
