import { z } from 'zod';
import { METRICS, OPERATORS } from '../rules';

export const ruleInput = z
  .object({
    name: z.string().trim().min(1, 'is required').max(100),
    description: z.string().trim().max(2000).optional().nullable(),
    enabled: z.boolean().default(true),
    metric: z.enum(Object.keys(METRICS) as [keyof typeof METRICS]),
    operator: z.enum(Object.keys(OPERATORS) as [keyof typeof OPERATORS]).default('gt'),
    threshold: z.coerce.number().default(0),
    threshold2: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
    useTolerance: z.boolean().default(false),
    durationSec: z.coerce.number().int().min(0).max(7 * 86400).default(0),
    severity: z.enum(['info', 'warning', 'critical']).default('warning'),
    scope: z.enum(['all', 'tags', 'reefers']).default('all'),
    scopeValue: z
      .union([z.array(z.union([z.string(), z.number()])), z.string()])
      .default([])
      .transform((v) => (typeof v === 'string' ? v : JSON.stringify(v))),
    repeatMin: z.coerce.number().int().min(0).max(1440).default(0),
    notifyEmail: z.boolean().default(false),
    notifyHook: z.boolean().default(false),
    autoResolve: z.boolean().default(true),
  })
  .refine((r) => !['outside', 'between'].includes(r.operator) || r.threshold2 !== null, { message: 'a second value is required for ranges', path: ['threshold2'] });
