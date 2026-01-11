import { z } from 'zod';

// The master schema for XMagic Proxy configuration
// This object is embedded as x-magic-proxy-descriptor in the docker-compose.yml
export const XMagicProxySchema = z.object({

  // The base configuration to modify:
  template: z.string(),

  // How the proxy should connect to the target service (must be a valid http(s) URL string)
  target: z.string().url().refine((v) => {
    try {
      const proto = new URL(v).protocol;
      return proto === 'http:' || proto === 'https:';
    } catch {
      return false;
    }
  }, { message: 'target must be a valid http or https URL' }),

  // The public hostname for the proxy to serve
  hostname: z.string(),

  // Optional additional user data. May contain multiple key-value pairs (e.g. `bar: foo`, `baz: zap`).
  // Keys are strings and values may be string, number, or null. May be an empty object.
  userData: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

export type XMagicProxyData = z.infer<typeof XMagicProxySchema>;

// Validate arbitrary input against the XMagicProxy schema
export type XMagicProxyValidationResult =
  | { valid: true; value: XMagicProxyData }
  | { valid: false; reason: string };

export function validateXMagicProxyData(data: unknown): XMagicProxyValidationResult {
  const result = XMagicProxySchema.safeParse(data);
  if (result.success) {
    return { valid: true, value: result.data };
  }

  // Build a human-readable reason from the Zod error issues
  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'value';
      return `${path} ${issue.message}`;
    })
    .join('; ');

  return { valid: false, reason };
}

export { XMagicProxySchema as xMagicProxySchema };
