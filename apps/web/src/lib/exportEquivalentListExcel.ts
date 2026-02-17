import type { EquivalentBucketPlanV2, RankedFoodItemV2 } from '@equivalentes/shared';
import { Workbook, type FillPattern } from 'exceljs';

import { buildDeliverableFilename, formatGeneratedAtLabel } from './exportDeliverables';

type EquivalentListExcelParams = {
  cid: string;
  generatedAt: Date;
  bucketPlan: EquivalentBucketPlanV2[];
  foods: RankedFoodItemV2[];
  resolveBucketLabel?: (bucketKey: string) => string;
};

type FoodRow = {
  bucketKey: string;
  bucketName: string;
  foodName: string;
  serving: string;
  score: number;
  kcal: number;
  choG: number;
  proG: number;
  fatG: number;
  reasons: string;
  bucketIndex: number;
};

const sanitizeText = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const toNumber = (value: number, digits = 1): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const buildFoodRows = (
  bucketPlan: EquivalentBucketPlanV2[],
  foods: RankedFoodItemV2[],
  resolveBucketLabel?: (bucketKey: string) => string,
): FoodRow[] => {
  const bucketOrderIndex = new Map<string, number>();
  const bucketNameByKey = new Map<string, string>();

  bucketPlan.forEach((bucket, index) => {
    bucketOrderIndex.set(bucket.bucketKey, index);
    bucketNameByKey.set(bucket.bucketKey, resolveBucketLabel ? resolveBucketLabel(bucket.bucketKey) : bucket.bucketName);
  });

  const buckets = new Map<
    string,
    { bucketKey: string; bucketName: string; parentOrder: number; foods: RankedFoodItemV2[] }
  >();

  for (const food of foods) {
    const bucketKey = String(food.bucketKey);
    const baseOrder = bucketOrderIndex.get(bucketKey) ?? 9_999;
    const bucketName = bucketNameByKey.get(bucketKey) ?? (resolveBucketLabel ? resolveBucketLabel(bucketKey) : bucketKey);
    const bucket = buckets.get(bucketKey);
    if (!bucket) {
      buckets.set(bucketKey, {
        bucketKey,
        bucketName,
        parentOrder: baseOrder,
        foods: [food],
      });
      continue;
    }
    bucket.foods.push(food);
  }

  const orderedBuckets = [...buckets.values()].sort((a, b) => {
    if (a.parentOrder !== b.parentOrder) return a.parentOrder - b.parentOrder;
    return a.bucketName.localeCompare(b.bucketName);
  });

  const rows: FoodRow[] = [];
  orderedBuckets.forEach((bucket, bucketIndex) => {
    const sortedFoods = bucket.foods
      .slice()
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    for (const food of sortedFoods) {
      rows.push({
        bucketKey: bucket.bucketKey,
        bucketName: bucket.bucketName,
        foodName: sanitizeText(food.name),
        serving: `${food.servingQty} ${sanitizeText(food.servingUnit)}`,
        score: toNumber(food.score, 1),
        kcal: toNumber(food.caloriesKcal, 0),
        choG: toNumber(food.carbsG, 1),
        proG: toNumber(food.proteinG, 1),
        fatG: toNumber(food.fatG, 1),
        reasons: (food.reasons ?? [])
          .slice(0, 3)
          .map((reason) => sanitizeText(reason.label))
          .join(' | '),
        bucketIndex,
      });
    }
  });

  return rows;
};

const thinBorder = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
} as const;

const groupFill = (bucketIndex: number): FillPattern => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: bucketIndex % 2 === 0 ? 'FFF5FAFF' : 'FFEEF6FF' },
});

export const downloadEquivalentListExcel = async ({
  cid,
  generatedAt,
  bucketPlan,
  foods,
  resolveBucketLabel,
}: EquivalentListExcelParams): Promise<void> => {
  const workbook = new Workbook();
  workbook.creator = 'FitPilot';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const worksheet = workbook.addWorksheet('Lista equivalentes', {
    properties: { defaultColWidth: 18 },
    views: [{ state: 'frozen', ySplit: 6 }],
  });

  worksheet.columns = [
    { width: 24 },
    { width: 34 },
    { width: 18 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 42 },
  ];

  worksheet.mergeCells('A1:I1');
  worksheet.mergeCells('A2:I2');
  worksheet.mergeCells('A3:I3');
  worksheet.mergeCells('A5:I5');

  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Lista de equivalentes alimentarios';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F4C81' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = 'Exportable profesional FitPilot';
  subtitleCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF376996' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  const metaCell = worksheet.getCell('A3');
  metaCell.value = `CID: ${sanitizeText(cid)}  |  Generado: ${formatGeneratedAtLabel(generatedAt)}`;
  metaCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF4F6C89' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };

  const summaryCell = worksheet.getCell('A5');
  summaryCell.value = `Buckets en plan: ${bucketPlan.length}  |  Alimentos recomendados: ${foods.length}`;
  summaryCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E466E' } };
  summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4FF' } };
  summaryCell.alignment = { vertical: 'middle', horizontal: 'left' };
  summaryCell.border = thinBorder;

  const headerRow = worksheet.getRow(6);
  headerRow.values = [
    'Grupo',
    'Alimento',
    'Porcion',
    'Score',
    'Kcal',
    'CHO (g)',
    'PRO (g)',
    'FAT (g)',
    'Razones clave',
  ];
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.border = thinBorder;
  });

  const rows = buildFoodRows(bucketPlan, foods, resolveBucketLabel);
  let rowIndex = 7;
  for (const row of rows) {
    const excelRow = worksheet.getRow(rowIndex);
    excelRow.values = [
      row.bucketName,
      row.foodName,
      row.serving,
      row.score,
      row.kcal,
      row.choG,
      row.proG,
      row.fatG,
      row.reasons || '-',
    ];

    excelRow.height = 20;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E3A56' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber >= 4 && colNumber <= 8 ? 'center' : 'left',
        wrapText: colNumber === 9,
      };
      cell.fill = groupFill(row.bucketIndex);
      cell.border = thinBorder;
    });

    rowIndex += 1;
  }

  worksheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: Math.max(6, rowIndex - 1), column: 9 },
  };

  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F4FF' },
  };
  worksheet.getCell('A2').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F4FF' },
  };
  worksheet.getCell('A3').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F4FF' },
  };

  const filename = buildDeliverableFilename('lista_equivalentes', cid, generatedAt, 'xlsx');
  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
