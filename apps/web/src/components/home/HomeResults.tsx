
import {
    type EquivalentBucketPlanV2,
    type EquivalentPlanResponseV2,
    type RankedFoodItemV2,
    type MealDistributionPlan,
} from '@equivalentes/shared';

import { canIncrease } from '../../lib/bucketPlanDynamic';
import { resolveFoodBucketLabel } from '../../lib/bucketLabels';
import { MacroPieChart } from '../MacroPieChart';
import { MealDistributionTable } from '../MealDistributionTable';

interface HomeResultsProps {
    cid?: string;
    plan: EquivalentPlanResponseV2;
    adjustedMacroTotals: {
        choG: number;
        proG: number;
        fatG: number;
        kcal: number;
    };
    adjustedBucketPlan: EquivalentBucketPlanV2[];
    adjustedTopFoodsByBucket: Record<string, RankedFoodItemV2[]>;
    adjustedExtendedFoods: RankedFoodItemV2[];
    editableBucketRows: any[]; // Using any[] for now as the type is inferred in original file, but ideally should be typed.
    adjustedMealDistribution: MealDistributionPlan;
    bucketLabelIndex: Map<string, any>;
    onEditPlan: () => void;
    onExportExcel: () => void;
    onExportPdf: () => void;
    onReset: () => void;
    onAdjustBucket: (bucketKey: string, step: number) => void;
}

export const HomeResults = ({
    cid,
    plan,
    adjustedMacroTotals,
    adjustedBucketPlan,
    adjustedTopFoodsByBucket,
    adjustedExtendedFoods,
    editableBucketRows,
    adjustedMealDistribution,
    bucketLabelIndex,
    onEditPlan,
    onExportExcel,
    onExportPdf,
    onReset,
    onAdjustBucket,
}: HomeResultsProps): JSX.Element => {
    const canIncreaseByBucket = editableBucketRows.reduce<Record<string, boolean>>((acc, bucket) => {
        acc[bucket.bucketKey] = canIncrease(bucket);
        return acc;
    }, {});

    return (
        <section className="lg:col-span-2 rounded-[1.8rem] border border-sky/12 bg-white/85 p-5 shadow-[0_16px_40px_rgba(24,47,80,0.1)] backdrop-blur-xl md:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky">Generated Plan</p>
                    <h2 className="mt-1 text-xl font-extrabold text-ink md:text-2xl">
                        Resultado de equivalentes
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">Identidad activa: {cid}</p>
                </div>
                <button
                    className="no-print rounded-xl border border-sky/35 bg-white px-4 py-2.5 text-sm font-semibold text-sky transition hover:border-sky hover:bg-sky-50"
                    onClick={onEditPlan}
                    type="button"
                >
                    Editar formulario
                </button>
            </div>

            <div className="animate-fade-in space-y-5">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                Kcal objetivo
                            </p>
                            <p className="mt-1 text-2xl font-extrabold text-ink">{adjustedMacroTotals.kcal}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                Referencia inicial: {plan.targets.targetCalories} kcal
                            </p>
                        </article>
                        <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                Carbohidratos
                            </p>
                            <p className="mt-1 text-2xl font-extrabold text-ink">
                                {adjustedMacroTotals.choG} g
                            </p>
                        </article>
                        <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                Proteina
                            </p>
                            <p className="mt-1 text-2xl font-extrabold text-ink">{adjustedMacroTotals.proG} g</p>
                        </article>
                        <article className="rounded-2xl border border-sky/12 bg-gradient-to-br from-cloud to-white p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                Grasa
                            </p>
                            <p className="mt-1 text-2xl font-extrabold text-ink">{adjustedMacroTotals.fatG} g</p>
                        </article>
                    </div>
                    <MacroPieChart
                        caloriesKcal={adjustedMacroTotals.kcal}
                        carbsG={adjustedMacroTotals.choG}
                        fatG={adjustedMacroTotals.fatG}
                        proteinG={adjustedMacroTotals.proG}
                    />
                </div>

                <div className="no-print flex flex-wrap gap-2">
                    <button
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(46,134,193,0.3)] transition hover:brightness-105 hover:shadow-[0_8px_22px_rgba(46,134,193,0.42)] sm:w-auto"
                        style={{
                            background: 'linear-gradient(90deg, #0f8bff 0%, #2e86c1 100%)',
                        }}
                        onClick={() => void onExportExcel()}
                        type="button"
                    >
                        Descargar lista de equivalentes (Excel)
                    </button>
                    <button
                        className="w-full rounded-xl border border-sky/40 bg-white px-4 py-2.5 text-sm font-bold text-ink transition hover:border-sky/60 hover:shadow-[0_4px_12px_rgba(103,182,223,0.12)] sm:w-auto"
                        onClick={() => void onExportPdf()}
                        type="button"
                    >
                        Descargar PDF clinico
                    </button>
                    <button
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                        onClick={onReset}
                        type="button"
                    >
                        Restablecer equivalentes
                    </button>
                </div>

                {adjustedMealDistribution.length > 0 && (
                    <MealDistributionTable
                        canIncreaseByBucket={canIncreaseByBucket}
                        mealDistribution={adjustedMealDistribution}
                        onAdjustBucket={onAdjustBucket}
                        bucketPlan={adjustedBucketPlan}
                    />
                )}

                <p className="text-xs text-slate-500">
                    Ajusta equivalentes con +/- en la tabla de distribucion por comida. La distribucion de macros y equivalentes se
                    actualiza en tiempo real. La lista de alimentos corresponde al plan generado.
                </p>
                <p className="text-[11px] font-semibold text-slate-500">Desliza horizontalmente para ver todas las columnas.</p>
                <div className="no-scrollbar touch-pan-x overflow-x-auto rounded-2xl border border-sky/12 bg-white">
                    <table className="min-w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-sky/10 bg-gradient-to-r from-sky-50/60 to-white text-left">
                                <th className="py-3 pl-4 pr-3 font-bold text-ink">Grupo</th>
                                <th className="py-3 pr-3 font-bold text-ink">Equiv./dia</th>
                                <th className="py-3 pr-3 font-bold text-ink">Macros</th>
                                <th className="py-3 pr-4 font-bold text-ink">Top alimentos (base)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {editableBucketRows.map((bucket) => {
                                const topFoods = (adjustedTopFoodsByBucket[bucket.bucketKey] ?? []).slice(0, 6);
                                const groupLabel =
                                    bucketLabelIndex.get(bucket.bucketKey)?.label ?? bucket.bucketName;
                                return (
                                    <tr
                                        key={bucket.bucketKey}
                                        className="border-b border-sky/6 align-top transition hover:bg-sky-50/30"
                                    >
                                        <td className="py-3 pl-4 pr-3 font-semibold text-ink">{groupLabel}</td>
                                        <td className="py-3 pr-3 tabular-nums">{bucket.exchangesPerDay}</td>
                                        <td className="py-3 pr-3 text-xs text-slate-600">
                                            CHO {bucket.choG}g / PRO {bucket.proG}g / FAT {bucket.fatG}g
                                        </td>
                                        <td className="py-3 pr-4 text-xs text-slate-700">
                                            {topFoods.length > 0
                                                ? topFoods.map((food) => food.name).join(', ')
                                                : 'Sin recomendaciones aun'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-extrabold text-ink">Lista extensa personalizada</h3>
                        <span
                            className="inline-flex items-center rounded-full border border-sky/25 bg-sky-50/70 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                            title="Recomendaciones estables del plan generado; no cambian al ajustar equivalentes."
                        >
                            Recomendaciones base del plan
                        </span>
                    </div>
                    <p className="mb-2 text-[11px] font-semibold text-slate-500">Desliza horizontalmente para revisar la tabla completa.</p>
                    <div className="no-scrollbar touch-pan-x max-h-[420px] overflow-x-auto overflow-y-auto rounded-xl border border-sky/12 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gradient-to-r from-sky-50/80 to-white/90 backdrop-blur-sm">
                                <tr className="border-b border-sky/10 text-left">
                                    <th className="px-4 py-2.5 font-bold text-ink">Alimento</th>
                                    <th className="px-3 py-2.5 font-bold text-ink">Grupo</th>
                                    <th className="px-3 py-2.5 font-bold text-ink">Score</th>
                                    <th className="px-4 py-2.5 font-bold text-ink">Razones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adjustedExtendedFoods.map((food) => (
                                    <tr
                                        key={food.id}
                                        className="border-b border-sky/6 align-top transition hover:bg-sky-50/30"
                                    >
                                        <td className="px-4 py-2 font-medium text-ink">{food.name}</td>
                                        <td className="px-3 py-2">{resolveFoodBucketLabel(food, bucketLabelIndex)}</td>
                                        <td className="px-3 py-2 tabular-nums">{food.score}</td>
                                        <td className="px-4 py-2 text-xs text-slate-600">
                                            {(food.reasons ?? [])
                                                .slice(0, 3)
                                                .map((reason: any) => reason.label)
                                                .join(' | ')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
};
