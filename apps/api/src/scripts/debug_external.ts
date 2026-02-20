
import { fetchExternalSmaeFoods, normalizeText } from './smaeFoodCurationUtils.js';

const main = async () => {
    console.log('Fetching external foods...');
    const externalFoods = await fetchExternalSmaeFoods();
    console.log(`Fetched ${externalFoods.length} external foods.`);

    const aceiteMatches = externalFoods.filter(f => f.normalizedName.includes('aceite'));
    console.log(`Found ${aceiteMatches.length} foods with "aceite".`);

    if (aceiteMatches.length > 0) {
        console.log('First 5 matches:');
        aceiteMatches.slice(0, 5).forEach(m => console.log(`- ${m.rawName} -> ${m.normalizedName} (Qty: ${m.equiQty} ${m.unitsRaw})`));
    }

    const exact = externalFoods.find(f => f.normalizedName === normalizeText('Aceite de oliva'));
    console.log(`Exact match for "Aceite de oliva": ${exact ? 'YES' : 'NO'}`);
};

main();
