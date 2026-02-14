export const safeSchema = (schema: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(schema)) {
    throw new Error(`Invalid schema: ${schema}`);
  }

  return schema;
};
