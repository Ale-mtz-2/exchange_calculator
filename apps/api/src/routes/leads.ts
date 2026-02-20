import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { prisma } from '../db/prisma.js';
import { safeSchema } from '../utils/sql.js';

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

type TrainingWindow = z.infer<typeof trainingWindowSchema>;

type LeadRecord = {
  id: string;
  cid: string | null;
  name: string;
  email: string | null;
  whatsapp: string | null;
  birthDate: Date | null;
  waistCm: number | string | null;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasDyslipidemia: boolean;
  trainingWindow: TrainingWindow;
  usesDairyInSnacks: boolean;
  termsAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LeadWriteInput = {
  cid?: string;
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  birthDate?: Date | null;
  waistCm?: number | null;
  hasDiabetes?: boolean;
  hasHypertension?: boolean;
  hasDyslipidemia?: boolean;
  trainingWindow?: TrainingWindow;
  usesDairyInSnacks?: boolean;
  termsAccepted?: boolean;
};

type LeadStore = {
  findFirst: (args: { where: { cid: string }; orderBy: { updatedAt: 'desc' } }) => Promise<LeadRecord | null>;
  create: (args: { data: LeadWriteInput }) => Promise<LeadRecord>;
  update: (args: { where: { id: string }; data: LeadWriteInput }) => Promise<LeadRecord>;
};

type LeadDbRow = {
  id: string;
  cid: string | null;
  name: string;
  email: string | null;
  whatsapp: string | null;
  birth_date: Date | string | null;
  waist_cm: string | number | null;
  has_diabetes: boolean;
  has_hypertension: boolean;
  has_dyslipidemia: boolean;
  training_window: TrainingWindow;
  uses_dairy_in_snacks: boolean;
  terms_accepted: boolean;
  created_at: Date;
  updated_at: Date;
};

const appSchema = safeSchema(env.DB_APP_SCHEMA);
let loggedLeadFallback = false;

const toLeadRecord = (row: LeadDbRow): LeadRecord => ({
  id: row.id,
  cid: row.cid,
  name: row.name,
  email: row.email,
  whatsapp: row.whatsapp,
  birthDate:
    row.birth_date === null
      ? null
      : row.birth_date instanceof Date
        ? row.birth_date
        : new Date(`${row.birth_date}T00:00:00.000Z`),
  waistCm: row.waist_cm,
  hasDiabetes: row.has_diabetes,
  hasHypertension: row.has_hypertension,
  hasDyslipidemia: row.has_dyslipidemia,
  trainingWindow: row.training_window,
  usesDairyInSnacks: row.uses_dairy_in_snacks,
  termsAccepted: row.terms_accepted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const createPgLeadStore = (): LeadStore => ({
  findFirst: async ({ where }) => {
    const result = await nutritionPool.query<LeadDbRow>(
      `
        SELECT
          id,
          cid,
          name,
          email,
          whatsapp,
          birth_date,
          waist_cm,
          has_diabetes,
          has_hypertension,
          has_dyslipidemia,
          training_window,
          uses_dairy_in_snacks,
          terms_accepted,
          created_at,
          updated_at
        FROM ${appSchema}.leads
        WHERE cid = $1
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [where.cid],
    );

    const row = result.rows[0];
    return row ? toLeadRecord(row) : null;
  },
  create: async ({ data }) => {
    const result = await nutritionPool.query<LeadDbRow>(
      `
        INSERT INTO ${appSchema}.leads (
          cid,
          name,
          email,
          whatsapp,
          birth_date,
          waist_cm,
          has_diabetes,
          has_hypertension,
          has_dyslipidemia,
          training_window,
          uses_dairy_in_snacks,
          terms_accepted
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING
          id,
          cid,
          name,
          email,
          whatsapp,
          birth_date,
          waist_cm,
          has_diabetes,
          has_hypertension,
          has_dyslipidemia,
          training_window,
          uses_dairy_in_snacks,
          terms_accepted,
          created_at,
          updated_at;
      `,
      [
        data.cid ?? null,
        data.name,
        data.email ?? null,
        data.whatsapp ?? null,
        data.birthDate ?? null,
        data.waistCm ?? null,
        data.hasDiabetes ?? false,
        data.hasHypertension ?? false,
        data.hasDyslipidemia ?? false,
        data.trainingWindow ?? 'none',
        data.usesDairyInSnacks ?? true,
        data.termsAccepted ?? false,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create lead');
    }

    return toLeadRecord(row);
  },
  update: async ({ where, data }) => {
    const result = await nutritionPool.query<LeadDbRow>(
      `
        UPDATE ${appSchema}.leads
        SET
          cid = $2,
          name = $3,
          email = $4,
          whatsapp = $5,
          birth_date = $6,
          waist_cm = $7,
          has_diabetes = $8,
          has_hypertension = $9,
          has_dyslipidemia = $10,
          training_window = $11,
          uses_dairy_in_snacks = $12,
          terms_accepted = $13
        WHERE id = $1
        RETURNING
          id,
          cid,
          name,
          email,
          whatsapp,
          birth_date,
          waist_cm,
          has_diabetes,
          has_hypertension,
          has_dyslipidemia,
          training_window,
          uses_dairy_in_snacks,
          terms_accepted,
          created_at,
          updated_at;
      `,
      [
        where.id,
        data.cid ?? null,
        data.name,
        data.email ?? null,
        data.whatsapp ?? null,
        data.birthDate ?? null,
        data.waistCm ?? null,
        data.hasDiabetes ?? false,
        data.hasHypertension ?? false,
        data.hasDyslipidemia ?? false,
        data.trainingWindow ?? 'none',
        data.usesDairyInSnacks ?? true,
        data.termsAccepted ?? false,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Lead not found for id=${where.id}`);
    }

    return toLeadRecord(row);
  },
});

const getLeadStore = (): LeadStore => {
  const delegate = (prisma as unknown as { lead?: LeadStore }).lead;
  if (delegate) {
    return delegate;
  }

  if (!loggedLeadFallback) {
    console.warn('[leads-store-fallback]', {
      reason: 'Prisma lead delegate unavailable. Falling back to SQL store.',
    });
    loggedLeadFallback = true;
  }

  return createPgLeadStore();
};

leadsRouter.get('/by-cid/:cid', async (req, res) => {
  try {
    const leads = getLeadStore();
    const cid = req.params.cid?.trim();
    if (!cid) {
      res.status(400).json({ error: 'CID invalido' });
      return;
    }

    const lead = await leads.findFirst({
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
    const leads = getLeadStore();
    const cid = req.params.cid?.trim();
    if (!cid) {
      res.status(400).json({ error: 'CID invalido' });
      return;
    }

    const data = upsertLeadByCidSchema.parse(req.body);
    const existing = await leads.findFirst({
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
      ? await leads.update({
        where: { id: existing.id },
        data: payload,
      })
      : await leads.create({
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
    const leads = getLeadStore();
    const data = postLeadSchema.parse(req.body);

    const lead = await leads.create({
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
