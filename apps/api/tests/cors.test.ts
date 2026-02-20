import { describe, expect, it } from 'vitest';

import { isOriginAllowed, normalizeOrigin, parseAllowedOrigins } from '../src/config/cors.js';

describe('cors config', () => {
  it('normalizes trailing slashes and whitespace', () => {
    expect(normalizeOrigin(' https://exchange-calculator.fitpilot.fit/ ')).toBe(
      'https://exchange-calculator.fitpilot.fit',
    );
  });

  it('uses WEB_ORIGIN as fallback when WEB_ORIGINS is not set', () => {
    const allowedOrigins = parseAllowedOrigins({
      webOrigin: 'https://exchange-calculator.fitpilot.fit/',
    });

    expect(Array.from(allowedOrigins)).toEqual(['https://exchange-calculator.fitpilot.fit']);
  });

  it('uses WEB_ORIGINS when provided and deduplicates normalized values', () => {
    const allowedOrigins = parseAllowedOrigins({
      webOrigin: 'https://exchange-calculator.fitpilot.fit',
      webOriginsCsv:
        ' https://exchange-calculator.fitpilot.fit/,https://exchange-calculator-web.onrender.com,https://exchange-calculator.fitpilot.fit ',
    });

    expect(Array.from(allowedOrigins).sort()).toEqual(
      ['https://exchange-calculator.fitpilot.fit', 'https://exchange-calculator-web.onrender.com'].sort(),
    );
  });

  it('falls back to WEB_ORIGIN when WEB_ORIGINS has no valid values', () => {
    const allowedOrigins = parseAllowedOrigins({
      webOrigin: 'https://exchange-calculator.fitpilot.fit',
      webOriginsCsv: ' ,  ,   ',
    });

    expect(Array.from(allowedOrigins)).toEqual(['https://exchange-calculator.fitpilot.fit']);
  });

  it('allows requests without Origin header', () => {
    const allowedOrigins = parseAllowedOrigins({
      webOrigin: 'https://exchange-calculator.fitpilot.fit',
    });

    expect(isOriginAllowed(undefined, allowedOrigins)).toBe(true);
  });

  it('allows origin in allowlist and blocks unknown origins', () => {
    const allowedOrigins = parseAllowedOrigins({
      webOrigin: 'https://exchange-calculator.fitpilot.fit',
      webOriginsCsv: 'https://exchange-calculator.fitpilot.fit,http://localhost:5173',
    });

    expect(isOriginAllowed('https://exchange-calculator.fitpilot.fit', allowedOrigins)).toBe(true);
    expect(isOriginAllowed('https://exchange-calculator-web.onrender.com', allowedOrigins)).toBe(false);
  });
});
