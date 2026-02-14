import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

const isDbConnectionLimitError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('max client connections reached') ||
    normalized.includes('maxclientsinsessionmode') ||
    normalized.includes('too many clients already') ||
    normalized.includes('too many database connections opened')
  );
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  void _next;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos inválidos',
      issues: err.issues,
    });
    return;
  }

  if (err instanceof Error) {
    if (isDbConnectionLimitError(err.message)) {
      res.status(503).json({
        error: 'Base de datos ocupada. Intenta nuevamente en unos segundos.',
        code: 'db_connection_limit',
      });
      return;
    }

    res.status(500).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Error inesperado' });
};
