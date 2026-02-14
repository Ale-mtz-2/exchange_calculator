import type {
  EnergyTargets,
  EquivalentGroupPlan,
  PatientProfile,
  RankedFoodItem,
} from '@equivalentes/shared';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import logoSrc from '../assets/FitPilot-Logo.svg';
import {
  buildDeliverableFilename,
  formatGeneratedAtLabel,
  type MacroTotals,
} from './exportDeliverables';

export const PDF_EXTENDED_FOODS_LIMIT = 120;

type ClinicalPdfParams = {
  cid: string;
  generatedAt: Date;
  profile: PatientProfile;
  targets: EnergyTargets;
  adjustedMacroTotals: MacroTotals;
  adjustedGroupPlan: EquivalentGroupPlan[];
  adjustedTopFoodsByGroup: Record<string, RankedFoodItem[]>;
  adjustedExtendedFoods: RankedFoodItem[];
};

const round = (value: number, digits = 1): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const safeText = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const goalLabelMap: Record<PatientProfile['goal'], string> = {
  maintain: 'Mantener',
  lose_fat: 'Perder grasa',
  gain_muscle: 'Ganar musculo',
};

const sexLabelMap: Record<PatientProfile['sex'], string> = {
  female: 'Femenino',
  male: 'Masculino',
};

const activityLabelMap: Record<PatientProfile['activityLevel'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const dietPatternLabelMap: Record<PatientProfile['dietPattern'], string> = {
  omnivore: 'Omnivoro',
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  pescatarian: 'Pescetariano',
};

const budgetLabelMap: Record<PatientProfile['budgetLevel'], string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};

const prepTimeLabelMap: Record<PatientProfile['prepTimeLevel'], string> = {
  short: 'Corto',
  medium: 'Medio',
  long: 'Largo',
};

const macroPercent = (valueG: number, totalKcal: number, factor: number): number => {
  if (totalKcal <= 0) return 0;
  return round(((valueG * factor) / totalKcal) * 100, 1);
};

const loadLogoDataUrl = async (assetUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = 260;
        const height = 78;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = assetUrl;
  });

const drawLabelValue = (
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  maxWidth = 220,
): number => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 96, 126);
  doc.text(label, x, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(24, 47, 80);
  const lines = doc.splitTextToSize(value || '-', maxWidth);
  doc.text(lines, x, y + 13);
  return y + 13 + lines.length * 11;
};

const drawMacroBar = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  choPct: number,
  proPct: number,
): void => {
  const choWidth = (Math.max(0, choPct) / 100) * width;
  const proWidth = (Math.max(0, proPct) / 100) * width;
  const fatWidth = Math.max(0, width - choWidth - proWidth);

  doc.setDrawColor(216, 229, 241);
  doc.setFillColor(246, 250, 255);
  doc.roundedRect(x, y, width, height, 6, 6, 'FD');

  doc.setFillColor(103, 182, 223);
  doc.roundedRect(x, y, choWidth, height, 6, 6, 'F');
  doc.setFillColor(52, 152, 219);
  doc.rect(x + choWidth, y, proWidth, height, 'F');
  doc.setFillColor(26, 82, 118);
  doc.roundedRect(x + choWidth + proWidth, y, fatWidth, height, 6, 6, 'F');
};

const drawSectionTitle = (doc: jsPDF, x: number, y: number, text: string): void => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(22, 78, 130);
  doc.text(text, x, y);
};

const getLastTableY = (doc: jsPDF): number => {
  const maybeDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  return maybeDoc.lastAutoTable?.finalY ?? 0;
};

const ensureSpace = (
  doc: jsPDF,
  currentY: number,
  requiredHeight: number,
  pageHeight: number,
  topMargin: number,
): number => {
  if (currentY + requiredHeight <= pageHeight - 44) return currentY;
  doc.addPage();
  return topMargin;
};

const drawCard = (doc: jsPDF, x: number, y: number, width: number, title: string, value: string): void => {
  doc.setDrawColor(214, 228, 240);
  doc.setFillColor(249, 253, 255);
  doc.roundedRect(x, y, width, 58, 10, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(92, 116, 140);
  doc.text(title, x + 10, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 47, 80);
  doc.text(value, x + 10, y + 39);
};

export const downloadClinicalPdf = async ({
  cid,
  generatedAt,
  profile,
  targets,
  adjustedMacroTotals,
  adjustedGroupPlan,
  adjustedTopFoodsByGroup,
  adjustedExtendedFoods,
}: ClinicalPdfParams): Promise<void> => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'letter',
    compress: true,
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const contentWidth = pageWidth - marginX * 2;
  const generatedLabel = formatGeneratedAtLabel(generatedAt);
  const logoDataUrl = await loadLogoDataUrl(logoSrc);
  const foodsForReport = adjustedExtendedFoods.slice(0, PDF_EXTENDED_FOODS_LIMIT);

  let y = 34;

  doc.setFillColor(246, 251, 255);
  doc.rect(0, 0, pageWidth, 128, 'F');
  doc.setDrawColor(214, 228, 240);
  doc.line(0, 128, pageWidth, 128);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX, y, 160, 48);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 47, 80);
  doc.text('Reporte clinico de equivalentes', marginX, y + 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(74, 96, 121);
  doc.text(`CID: ${safeText(cid)}  |  Generado: ${generatedLabel}`, marginX, y + 82);

  y = 146;

  drawSectionTitle(doc, marginX, y, 'Resumen del plan');
  y += 10;
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  drawCard(doc, marginX, y, cardWidth, 'KCAL OBJETIVO', `${adjustedMacroTotals.kcal}`);
  drawCard(
    doc,
    marginX + cardWidth + cardGap,
    y,
    cardWidth,
    'CARBOHIDRATOS',
    `${adjustedMacroTotals.choG} g`,
  );
  drawCard(
    doc,
    marginX + (cardWidth + cardGap) * 2,
    y,
    cardWidth,
    'PROTEINA',
    `${adjustedMacroTotals.proG} g`,
  );
  drawCard(
    doc,
    marginX + (cardWidth + cardGap) * 3,
    y,
    cardWidth,
    'GRASA',
    `${adjustedMacroTotals.fatG} g`,
  );
  y += 74;

  const choPct = macroPercent(adjustedMacroTotals.choG, adjustedMacroTotals.kcal, 4);
  const proPct = macroPercent(adjustedMacroTotals.proG, adjustedMacroTotals.kcal, 4);
  const fatPct = macroPercent(adjustedMacroTotals.fatG, adjustedMacroTotals.kcal, 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(70, 96, 126);
  doc.text('Distribucion de macronutrientes (%)', marginX, y);
  y += 10;
  drawMacroBar(doc, marginX, y, contentWidth, 14, choPct, proPct);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`CHO ${choPct}%`, marginX, y);
  doc.text(`PRO ${proPct}%`, marginX + 90, y);
  doc.text(`FAT ${fatPct}%`, marginX + 180, y);
  y += 18;

  y = ensureSpace(doc, y, 150, pageHeight, 42);
  drawSectionTitle(doc, marginX, y, 'Perfil tecnico y metas energeticas');
  y += 14;

  const colGap = 16;
  const colWidth = (contentWidth - colGap) / 2;
  const leftX = marginX;
  const rightX = marginX + colWidth + colGap;
  const lineStartY = y;

  let leftY = lineStartY;
  leftY = drawLabelValue(doc, leftX, leftY, 'Objetivo', goalLabelMap[profile.goal]);
  leftY = drawLabelValue(doc, leftX, leftY + 2, 'Meta semanal', `${profile.goalDeltaKgPerWeek} kg/semana`);
  leftY = drawLabelValue(doc, leftX, leftY + 2, 'Sexo', sexLabelMap[profile.sex]);
  leftY = drawLabelValue(doc, leftX, leftY + 2, 'Edad', `${profile.age} anios`);
  leftY = drawLabelValue(
    doc,
    leftX,
    leftY + 2,
    'Antropometria',
    `${profile.weightKg} kg / ${profile.heightCm} cm`,
    colWidth,
  );
  leftY = drawLabelValue(doc, leftX, leftY + 2, 'Actividad', activityLabelMap[profile.activityLevel]);
  leftY = drawLabelValue(doc, leftX, leftY + 2, 'Comidas por dia', String(profile.mealsPerDay));

  let rightY = lineStartY;
  rightY = drawLabelValue(doc, rightX, rightY, 'Pais - Estado', `${profile.countryCode} - ${profile.stateCode}`);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'Sistema', profile.systemId);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'Formula kcal', profile.formulaId);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'Patron', dietPatternLabelMap[profile.dietPattern]);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'Presupuesto', budgetLabelMap[profile.budgetLevel]);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'Prep time', prepTimeLabelMap[profile.prepTimeLevel]);
  rightY = drawLabelValue(doc, rightX, rightY + 2, 'BMR / TDEE', `${targets.bmr} / ${targets.tdee} kcal`);
  rightY = drawLabelValue(
    doc,
    rightX,
    rightY + 2,
    'Alergias / Intolerancias',
    `${profile.allergies.join(', ') || '-'} | ${profile.intolerances.join(', ') || '-'}`,
    colWidth,
  );

  y = Math.max(leftY, rightY) + 10;

  y = ensureSpace(doc, y, 180, pageHeight, 42);
  drawSectionTitle(doc, marginX, y, 'Tabla principal de equivalentes');
  y += 8;
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Grupo', 'Equiv./dia', 'CHO (g)', 'PRO (g)', 'FAT (g)', 'KCAL']],
    body: adjustedGroupPlan.map((group) => [
      group.groupName,
      String(group.exchangesPerDay),
      String(group.choG),
      String(group.proG),
      String(group.fatG),
      String(group.kcal),
    ]),
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 4,
      textColor: [30, 49, 70],
    },
    headStyles: {
      fillColor: [103, 182, 223],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [247, 251, 255],
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 0) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = getLastTableY(doc) + 16;

  y = ensureSpace(doc, y, 120, pageHeight, 42);
  drawSectionTitle(doc, marginX, y, 'Top alimentos por grupo');
  y += 8;

  const topRows = adjustedGroupPlan.map((group) => {
    const key = String(group.groupCode);
    const foods = (adjustedTopFoodsByGroup[key] ?? [])
      .slice(0, 6)
      .map((food) => safeText(food.name))
      .join(', ');
    return [group.groupName, foods || 'Sin recomendaciones disponibles'];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Grupo', 'Recomendaciones']],
    body: topRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 4,
      textColor: [30, 49, 70],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [26, 82, 118],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 150, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 150 },
    },
  });
  y = getLastTableY(doc) + 16;

  y = ensureSpace(doc, y, 180, pageHeight, 42);
  drawSectionTitle(
    doc,
    marginX,
    y,
    `Anexo: alimentos recomendados (top ${foodsForReport.length}/${adjustedExtendedFoods.length})`,
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Alimento', 'Grupo', 'Score', 'Kcal', 'P/C/F (g)', 'Porcion', 'Razones']],
    body: foodsForReport.map((food) => [
      safeText(food.name),
      String(food.subgroupCode ?? food.groupCode),
      String(round(food.score, 1)),
      String(round(food.caloriesKcal, 0)),
      `${round(food.proteinG, 1)}/${round(food.carbsG, 1)}/${round(food.fatG, 1)}`,
      `${food.servingQty} ${safeText(food.servingUnit)}`,
      (food.reasons ?? [])
        .slice(0, 3)
        .map((reason) => safeText(reason.label))
        .join(' | '),
    ]),
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 3,
      textColor: [30, 49, 70],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [103, 182, 223],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [247, 251, 255],
    },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 55 },
      2: { cellWidth: 44 },
      3: { cellWidth: 40 },
      4: { cellWidth: 72 },
      5: { cellWidth: 65 },
      6: { cellWidth: 'auto' },
    },
  });
  y = getLastTableY(doc) + 14;

  y = ensureSpace(doc, y, 46, pageHeight, 42);
  doc.setDrawColor(214, 228, 240);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(84, 104, 126);
  const disclaimer =
    'Este reporte es de apoyo tecnico para planeacion alimentaria y no sustituye la valoracion clinica profesional.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth), marginX, y + 13);

  const totalPages = doc.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    doc.setPage(pageIndex);
    doc.setDrawColor(225, 235, 244);
    doc.line(marginX, pageHeight - 26, pageWidth - marginX, pageHeight - 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(98, 116, 136);
    doc.text(`CID: ${safeText(cid)} | ${generatedLabel}`, marginX, pageHeight - 14);
    doc.text(`Pagina ${pageIndex}/${totalPages}`, pageWidth - marginX, pageHeight - 14, {
      align: 'right',
    });
  }

  const filename = buildDeliverableFilename('reporte_clinico', cid, generatedAt, 'pdf');
  doc.save(filename);
};
