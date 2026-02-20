import { loadFoodsForSystemIdV2 } from '../services/nutritionCatalogV2.js';

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const main = async (): Promise<void> => {
  console.log('Fetching foods for mx_smae...');
  const { foods } = await loadFoodsForSystemIdV2('mx_smae');
  console.log(`Fetched ${foods.length} foods.`);

  const aceiteMatches = foods.filter((food) => normalizeText(food.name).includes('aceite'));
  console.log(`Found ${aceiteMatches.length} foods with "aceite".`);

  if (aceiteMatches.length > 0) {
    console.log('First 5 matches:');
    for (const item of aceiteMatches.slice(0, 5)) {
      console.log(`- ${item.name} (group=${item.groupCode}, portion=${item.servingQty} ${item.servingUnit})`);
    }
  }

  const exact = foods.find((food) => normalizeText(food.name) === normalizeText('Aceite de oliva'));
  console.log(`Exact match for "Aceite de oliva": ${exact ? 'YES' : 'NO'}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
