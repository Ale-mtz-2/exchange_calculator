import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';

const unauthorized = (res: Response): void => {
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).json({ error: 'No autorizado' });
};

/** Constant-time string comparison to prevent timing attacks. */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Compare bufA against itself so the time is still constant,
    // then return false to avoid length-oracle leaks.
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
};

export const basicAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    unauthorized(res);
    return;
  }

  const encoded = auth.slice('Basic '.length);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex < 0) {
    unauthorized(res);
    return;
  }

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (!safeEqual(user, env.ADMIN_USER) || !safeEqual(pass, env.ADMIN_PASS)) {
    unauthorized(res);
    return;
  }

  next();
};
