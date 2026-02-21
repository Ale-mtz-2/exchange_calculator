export type PersonalPreferences = {
  prefersSweetSnacks: boolean;
  prefersSavorySnacks: boolean;
  avoidsUltraProcessed: boolean;
};

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

const SWEET_SNACK_LIKES = ['fruta', 'yogur', 'avena'];
const SAVORY_SNACK_LIKES = ['queso', 'huevo', 'atun'];
const ULTRA_PROCESSED_DISLIKES = [
  'jamon',
  'salchicha',
  'chorizo',
  'tocino',
  'aderezo',
  'mayonesa',
  'embutido',
];

export const defaultPersonalPreferences = (): PersonalPreferences => ({
  prefersSweetSnacks: false,
  prefersSavorySnacks: false,
  avoidsUltraProcessed: false,
});

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

export const dedupeCaseInsensitive = (items: string[]): string[] => {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const value = raw.trim();
    if (!value) continue;
    const normalized = normalize(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(value);
  }

  return unique;
};

export const applyPersonalPreferencesToLists = (
  likes: string[],
  dislikes: string[],
  preferences: PersonalPreferences,
): { likes: string[]; dislikes: string[] } => {
  const likesFromPreferences = [
    ...(preferences.prefersSweetSnacks ? SWEET_SNACK_LIKES : []),
    ...(preferences.prefersSavorySnacks ? SAVORY_SNACK_LIKES : []),
  ];
  const dislikesFromPreferences = preferences.avoidsUltraProcessed ? ULTRA_PROCESSED_DISLIKES : [];

  return {
    likes: dedupeCaseInsensitive([...likes, ...likesFromPreferences]),
    dislikes: dedupeCaseInsensitive([...dislikes, ...dislikesFromPreferences]),
  };
};

export const formatPersonalPreferencesSummary = (
  usesDairyInSnacks: boolean,
  preferences: PersonalPreferences,
): string => {
  const labels = [
    usesDairyInSnacks ? 'Incluir lacteos en colaciones' : 'Sin lacteos en colaciones',
    ...(preferences.prefersSweetSnacks ? ['Prefiere colaciones dulces'] : []),
    ...(preferences.prefersSavorySnacks ? ['Prefiere colaciones saladas'] : []),
    ...(preferences.avoidsUltraProcessed ? ['Evita ultraprocesados'] : []),
  ];

  return labels.join(', ');
};
