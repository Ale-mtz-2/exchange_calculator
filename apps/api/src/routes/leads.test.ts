import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../db/prisma.js', () => ({
  prisma: mockPrisma,
}));

import { leadsRouter } from './leads.js';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/leads', leadsRouter);
  return app;
};

describe('leads routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 404 for GET /by-cid/:cid when lead does not exist', async () => {
    mockPrisma.lead.findFirst.mockResolvedValueOnce(null);

    const app = buildTestApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/leads/by-cid/guest_404`);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it('creates and then updates lead with PUT /by-cid/:cid', async () => {
    const createdLead = {
      id: 'lead_1',
      cid: 'guest_abc',
      name: 'Paciente Uno',
      email: null,
      whatsapp: null,
      birthDate: null,
      waistCm: null,
      hasDiabetes: false,
      hasHypertension: false,
      hasDyslipidemia: false,
      trainingWindow: 'none',
      usesDairyInSnacks: true,
      planningFocus: 'hybrid_sport',
      termsAccepted: false,
      createdAt: new Date('2026-02-18T10:00:00.000Z'),
      updatedAt: new Date('2026-02-18T10:00:00.000Z'),
    };

    const updatedLead = {
      ...createdLead,
      email: 'paciente@example.com',
      updatedAt: new Date('2026-02-18T10:05:00.000Z'),
    };

    mockPrisma.lead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdLead);
    mockPrisma.lead.create.mockResolvedValueOnce(createdLead);
    mockPrisma.lead.update.mockResolvedValueOnce(updatedLead);

    const app = buildTestApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const createResponse = await fetch(`http://127.0.0.1:${port}/api/leads/by-cid/guest_abc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Paciente Uno',
          hasDiabetes: false,
          trainingWindow: 'none',
          planningFocus: 'hybrid_sport',
        }),
      });
      const createBody = await createResponse.json();

      expect(createResponse.status).toBe(200);
      expect(createBody.fullName).toBe('Paciente Uno');
      expect(createBody.planningFocus).toBe('hybrid_sport');
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1);

      const updateResponse = await fetch(`http://127.0.0.1:${port}/api/leads/by-cid/guest_abc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'paciente@example.com',
        }),
      });
      const updateBody = await updateResponse.json();

      expect(updateResponse.status).toBe(200);
      expect(updateBody.email).toBe('paciente@example.com');
      expect(mockPrisma.lead.update).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });
});
