import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../db/prisma.js';

export const leadsRouter = Router();

const trainingWindowSchema = z.enum(['none', 'morning', 'afternoon', 'evening']);

const normalizeNullableText = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const toDateOnly = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
};

const postLeadSchema = z
  .object({
    cid: z.string().min(1).max(200).optional(),
    name: z.string().min(1, 'El nombre es requerido'),
    email: z.string().email('Email invalido').optional().or(z.literal('')),
    whatsapp: z.string().optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate debe ser YYYY-MM-DD')
      .optional()
      .nullable(),
    waistCm: z.number().min(40).max(250).optional().nullable(),
    hasDiabetes: z.boolean().optional(),
    hasHypertension: z.boolean().optional(),
    hasDyslipidemia: z.boolean().optional(),
    trainingWindow: trainingWindowSchema.optional(),
    usesDairyInSnacks: z.boolean().optional(),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'Debes aceptar terminos y condiciones' }),
    }),
  })
  .refine((data) => data.email || data.whatsapp, {
    message: 'Debes proporcionar al menos un metodo de contacto (Email o WhatsApp)',
    path: ['email'],
  });

const upsertLeadByCidSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    email: z.string().email('Email invalido').optional().or(z.literal('')),
    whatsapp: z.string().optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate debe ser YYYY-MM-DD')
      .optional()
      .nullable(),
    waistCm: z.number().min(40).max(250).optional().nullable(),
    hasDiabetes: z.boolean().optional(),
    hasHypertension: z.boolean().optional(),
    hasDyslipidemia: z.boolean().optional(),
    trainingWindow: trainingWindowSchema.optional(),
    usesDairyInSnacks: z.boolean().optional(),
    termsAccepted: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.email !== undefined ||
      data.whatsapp !== undefined ||
      data.birthDate !== undefined ||
      data.waistCm !== undefined ||
      data.hasDiabetes !== undefined ||
      data.hasHypertension !== undefined ||
      data.hasDyslipidemia !== undefined ||
      data.trainingWindow !== undefined ||
      data.usesDairyInSnacks !== undefined ||
      data.termsAccepted !== undefined,
    {
      message: 'Debes enviar al menos un campo para actualizar',
    },
  );

leadsRouter.get('/by-cid/:cid', async (req, res) => {
  try {
    const cid = req.params.cid?.trim();
    if (!cid) {
      res.status(400).json({ error: 'CID invalido' });
      return;
    }

    const lead = await prisma.lead.findFirst({
      where: { cid },
      orderBy: { updatedAt: 'desc' },
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead no encontrado' });
      return;
    }

    res.json({
      id: lead.id,
      cid: lead.cid,
      fullName: lead.name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      birthDate: lead.birthDate ? lead.birthDate.toISOString().slice(0, 10) : null,
      waistCm: lead.waistCm ? Number(lead.waistCm) : null,
      hasDiabetes: lead.hasDiabetes,
      hasHypertension: lead.hasHypertension,
      hasDyslipidemia: lead.hasDyslipidemia,
      trainingWindow: lead.trainingWindow,
      usesDairyInSnacks: lead.usesDairyInSnacks,
      termsAccepted: lead.termsAccepted,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching lead by cid:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

leadsRouter.put('/by-cid/:cid', async (req, res) => {
  try {
    const cid = req.params.cid?.trim();
    if (!cid) {
      res.status(400).json({ error: 'CID invalido' });
      return;
    }

    const data = upsertLeadByCidSchema.parse(req.body);
    const existing = await prisma.lead.findFirst({
      where: { cid },
      orderBy: { updatedAt: 'desc' },
    });

    const payload = {
      cid,
      name: data.fullName ?? existing?.name ?? 'Sin nombre',
      ...(data.email !== undefined ? { email: normalizeNullableText(data.email || undefined) } : {}),
      ...(data.whatsapp !== undefined ? { whatsapp: normalizeNullableText(data.whatsapp || undefined) } : {}),
      ...(data.birthDate !== undefined ? { birthDate: toDateOnly(data.birthDate) } : {}),
      ...(data.waistCm !== undefined ? { waistCm: data.waistCm } : {}),
      ...(data.hasDiabetes !== undefined ? { hasDiabetes: data.hasDiabetes } : {}),
      ...(data.hasHypertension !== undefined ? { hasHypertension: data.hasHypertension } : {}),
      ...(data.hasDyslipidemia !== undefined ? { hasDyslipidemia: data.hasDyslipidemia } : {}),
      ...(data.trainingWindow !== undefined ? { trainingWindow: data.trainingWindow } : {}),
      ...(data.usesDairyInSnacks !== undefined ? { usesDairyInSnacks: data.usesDairyInSnacks } : {}),
      ...(data.termsAccepted !== undefined ? { termsAccepted: data.termsAccepted } : {}),
    };

    const lead = existing
      ? await prisma.lead.update({
        where: { id: existing.id },
        data: payload,
      })
      : await prisma.lead.create({
        data: payload,
      });

    res.json({
      id: lead.id,
      cid: lead.cid,
      fullName: lead.name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      birthDate: lead.birthDate ? lead.birthDate.toISOString().slice(0, 10) : null,
      waistCm: lead.waistCm ? Number(lead.waistCm) : null,
      hasDiabetes: lead.hasDiabetes,
      hasHypertension: lead.hasHypertension,
      hasDyslipidemia: lead.hasDyslipidemia,
      trainingWindow: lead.trainingWindow,
      usesDairyInSnacks: lead.usesDairyInSnacks,
      termsAccepted: lead.termsAccepted,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Datos invalidos', details: error.errors });
      return;
    }

    console.error('Error upserting lead by cid:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

leadsRouter.post('/', async (req, res) => {
  try {
    const data = postLeadSchema.parse(req.body);

    const lead = await prisma.lead.create({
      data: {
        ...(data.cid ? { cid: data.cid } : {}),
        name: data.name.trim(),
        email: normalizeNullableText(data.email || undefined),
        whatsapp: normalizeNullableText(data.whatsapp || undefined),
        birthDate: toDateOnly(data.birthDate),
        ...(data.waistCm !== undefined ? { waistCm: data.waistCm } : {}),
        hasDiabetes: data.hasDiabetes ?? false,
        hasHypertension: data.hasHypertension ?? false,
        hasDyslipidemia: data.hasDyslipidemia ?? false,
        trainingWindow: data.trainingWindow ?? 'none',
        usesDairyInSnacks: data.usesDairyInSnacks ?? true,
        termsAccepted: data.termsAccepted,
      },
    });

    res.status(201).json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Datos invalidos', details: error.errors });
      return;
    }

    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
