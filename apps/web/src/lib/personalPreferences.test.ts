import { describe, expect, it } from 'vitest';

import {
  applyPersonalPreferencesToLists,
  dedupeCaseInsensitive,
  formatPersonalPreferencesSummary,
} from './personalPreferences';

describe('personalPreferences', () => {
  it('dedupes likes and dislikes case-insensitively', () => {
    const result = dedupeCaseInsensitive(['Fruta', 'fruta', ' FRUTA ', 'Avena']);
    expect(result).toEqual(['Fruta', 'Avena']);
  });

  it('merges sweet and savory snack preferences into likes', () => {
    const result = applyPersonalPreferencesToLists(
      ['pollo', 'Fruta'],
      [],
      {
        prefersSweetSnacks: true,
        prefersSavorySnacks: true,
        avoidsUltraProcessed: false,
      },
    );

    expect(result.likes).toEqual([
      'pollo',
      'Fruta',
      'yogur',
      'avena',
      'queso',
      'huevo',
      'atun',
    ]);
    expect(result.dislikes).toEqual([]);
  });

  it('adds ultra-processed exclusions when selected', () => {
    const result = applyPersonalPreferencesToLists(
      [],
      ['Jamon', 'brocoli'],
      {
        prefersSweetSnacks: false,
        prefersSavorySnacks: false,
        avoidsUltraProcessed: true,
      },
    );

    expect(result.dislikes).toEqual([
      'Jamon',
      'brocoli',
      'salchicha',
      'chorizo',
      'tocino',
      'aderezo',
      'mayonesa',
      'embutido',
    ]);
  });

  it('formats review summary with selected options', () => {
    const summary = formatPersonalPreferencesSummary(true, {
      prefersSweetSnacks: true,
      prefersSavorySnacks: false,
      avoidsUltraProcessed: true,
    });

    expect(summary).toContain('Incluir lacteos en colaciones');
    expect(summary).toContain('Prefiere colaciones dulces');
    expect(summary).toContain('Evita ultraprocesados');
  });
});
