import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

export const leadsRouter = Router();

// Validation schema
const LeadSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    whatsapp: z.string().optional().or(z.literal('')),
}).refine((data) => data.email || data.whatsapp, {
    message: 'Debes proporcionar al menos un método de contacto (Email o WhatsApp)',
    path: ['email'], // Attach error to email field
});

leadsRouter.post('/', async (req, res) => {
    try {
        const data = LeadSchema.parse(req.body);

        const lead = await prisma.lead.create({
            data: {
                name: data.name,
                email: data.email || null,
                whatsapp: data.whatsapp || null,
            },
        });

        res.status(201).json(lead);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        } else {
            console.error('Error creating lead:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});
