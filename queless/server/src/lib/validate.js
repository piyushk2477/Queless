import { z } from 'zod';
import { err } from './errors.js';

/** Parse input with a Zod schema; the first problem becomes a VALIDATION error. */
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw err.validation(`${where}${issue?.message ?? 'Invalid input'}`);
  }
  return r.data;
}

export const id = z.guid();

/** Read and validate a UUID route param. */
export const param = (params, name) => parse(id, params[name]);

// Shared shapes
export const notesSchema = z
  .object({
    party_size: z.number().int().min(1).max(20).optional(),
    accessibility: z.array(z.enum(['wheelchair', 'elderly', 'pregnant', 'hearing', 'visual', 'child'])).max(6).optional(),
    text: z.string().trim().max(140).optional(),
  })
  .default({});

export const prereqAckSchema = z.array(z.string().max(60)).max(30).default([]);

export const email = z.email('Enter a valid email').transform((e) => e.trim().toLowerCase());
export const password = z
  .string()
  .min(8, 'Password needs at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/\d/, 'Password needs a number');

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
