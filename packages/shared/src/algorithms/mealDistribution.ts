import type {
    EquivalentGroupPlan,
    MealDistributionPlan,
    MealSlot,
    PatientProfile,
} from '../types';

// ────────────────────────────────────────────────────────────────
// Meal names by number of meals per day
// ────────────────────────────────────────────────────────────────

const MEAL_NAMES: Record<3 | 4 | 5, string[]> = {
    3: ['Desayuno', 'Comida', 'Cena'],
    4: ['Desayuno', 'Colacion AM', 'Comida', 'Cena'],
    5: ['Desayuno', 'Colacion AM', 'Comida', 'Colacion PM', 'Cena'],
};

// ────────────────────────────────────────────────────────────────
// Distribution matrices: percentage of daily equivalents per meal
// Key = group family, values = percentage per meal slot
// ────────────────────────────────────────────────────────────────

type GoalKey = 'lose_fat' | 'maintain' | 'gain_muscle';

/**
 * Returns the distribution percentages for each group across meals.
 * The percentages are goal-aware — e.g. lose_fat concentrates carbs
 * differently than gain_muscle.
 */
const getDistributionMatrix = (
    mealsPerDay: 3 | 4 | 5,
    goal: GoalKey,
): Record<string, number[]> => {
    if (mealsPerDay === 3) {
        // 3 meals: Desayuno, Comida, Cena
        const base: Record<string, number[]> = {
            vegetable: [15, 45, 40],
            fruit: [50, 25, 25],
            carb: [30, 40, 30],
            legume: [0, 60, 40],
            protein: [25, 40, 35],
            milk: [50, 0, 50],
            fat: [30, 35, 35],
            sugar: [50, 50, 0],
        };
        if (goal === 'lose_fat') {
            base.carb = [35, 40, 25]; // less carbs at dinner
            base.fruit = [60, 25, 15]; // fruit early
        } else if (goal === 'gain_muscle') {
            base.carb = [30, 35, 35]; // more even carb spread
            base.protein = [30, 35, 35]; // protein spread evenly
        }
        return base;
    }

    if (mealsPerDay === 4) {
        // 4 meals: Desayuno, Colacion AM, Comida, Cena
        const base: Record<string, number[]> = {
            vegetable: [10, 5, 45, 40],
            fruit: [35, 30, 20, 15],
            carb: [25, 15, 35, 25],
            legume: [0, 0, 60, 40],
            protein: [25, 0, 40, 35],
            milk: [40, 30, 0, 30],
            fat: [25, 15, 30, 30],
            sugar: [30, 40, 30, 0],
        };
        if (goal === 'lose_fat') {
            base.carb = [30, 10, 40, 20];
            base.fruit = [40, 30, 20, 10];
            base.sugar = [0, 0, 0, 0]; // already excluded at plan level
        } else if (goal === 'gain_muscle') {
            base.carb = [25, 15, 30, 30];
            base.protein = [25, 5, 35, 35];
        }
        return base;
    }

    // 5 meals: Desayuno, Colacion AM, Comida, Colacion PM, Cena
    const base: Record<string, number[]> = {
        vegetable: [10, 0, 40, 5, 45],
        fruit: [25, 25, 15, 25, 10],
        carb: [25, 10, 30, 10, 25],
        legume: [0, 0, 55, 0, 45],
        protein: [20, 5, 35, 5, 35],
        milk: [35, 25, 0, 25, 15],
        fat: [25, 10, 30, 10, 25],
        sugar: [25, 25, 25, 25, 0],
    };
    if (goal === 'lose_fat') {
        base.carb = [25, 10, 35, 10, 20];
        base.fruit = [30, 25, 15, 20, 10];
        base.sugar = [0, 0, 0, 0, 0];
    } else if (goal === 'gain_muscle') {
        base.carb = [20, 15, 25, 15, 25];
        base.protein = [20, 10, 30, 10, 30];
    }
    return base;
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const roundHalf = (v: number): number => Math.round(v * 2) / 2;

/**
 * Map a parent group code to the family key used in the distribution matrix.
 * Subgroup codes (e.g. `aoa_bajo_grasa`) map to their parent family (`protein`).
 */
const toFamilyKey = (code: string): string => {
    if (code.startsWith('aoa_')) return 'protein';
    if (code.startsWith('cereal_')) return 'carb';
    if (code.startsWith('leche_')) return 'milk';
    if (code.startsWith('azucar_')) return 'sugar';
    if (code.startsWith('grasa_')) return 'fat';
    return code; // vegetable, fruit, legume, protein, carb, milk, fat, sugar
};

// ────────────────────────────────────────────────────────────────
// Main algorithm
// ────────────────────────────────────────────────────────────────

/**
 * Distributes daily food-group equivalents across meal slots.
 *
 * @param groupPlan  The daily equivalent plan (output of plan generator)
 * @param profile    Patient profile containing mealsPerDay and goal
 * @returns          An array of MealSlot objects, one per meal
 */
export const distributeMeals = (
    groupPlan: EquivalentGroupPlan[],
    profile: Pick<PatientProfile, 'mealsPerDay' | 'goal'>,
): MealDistributionPlan => {
    const meals = profile.mealsPerDay as 3 | 4 | 5;
    const mealNames = MEAL_NAMES[meals] ?? MEAL_NAMES[3];
    const goalKey = (profile.goal ?? 'maintain') as GoalKey;
    const matrix = getDistributionMatrix(meals, goalKey);

    // Aggregate subgroup exchanges into family buckets
    const familyTotals = new Map<string, number>();
    for (const g of groupPlan) {
        const family = toFamilyKey(g.groupCode);
        familyTotals.set(family, (familyTotals.get(family) ?? 0) + g.exchangesPerDay);
    }

    // Build meal slots
    const slots: MealSlot[] = mealNames.map((name, mealIdx) => {
        const distribution: Record<string, number> = {};

        for (const g of groupPlan) {
            const family = toFamilyKey(g.groupCode);
            const pcts = matrix[family];
            const dailyTotal = g.exchangesPerDay;

            if (!pcts || dailyTotal <= 0) {
                distribution[g.groupCode] = 0;
                continue;
            }

            const familyTotal = familyTotals.get(family) ?? dailyTotal;

            // For subgroups: share the family's meal allocation proportionally
            // among subgroups by their weight in the family
            const subgroupWeight = familyTotal > 0 ? dailyTotal / familyTotal : 0;
            const familyMealAlloc = ((pcts[mealIdx] ?? 0) / 100) * familyTotal;
            const raw = familyMealAlloc * subgroupWeight;

            distribution[g.groupCode] = roundHalf(raw);
        }

        return { name, distribution };
    });

    // Fix rounding: ensure per-group sum across meals == daily total
    for (const g of groupPlan) {
        const code = g.groupCode;
        const target = g.exchangesPerDay;
        const sumAcrossMeals = slots.reduce((s, slot) => s + (slot.distribution[code] ?? 0), 0);
        const diff = roundHalf(target - sumAcrossMeals);

        if (Math.abs(diff) >= 0.5) {
            // Add/remove from the largest meal slot for this group
            const family = toFamilyKey(code);
            const pcts = matrix[family] ?? [];
            const maxMealIdx = pcts.indexOf(Math.max(...pcts));
            const idx = maxMealIdx >= 0 ? maxMealIdx : 0;
            const slot = slots[idx];
            if (slot) {
                slot.distribution[code] = roundHalf(
                    (slot.distribution[code] ?? 0) + diff,
                );
            }
        }
    }

    return slots;
};

export { MEAL_NAMES };
