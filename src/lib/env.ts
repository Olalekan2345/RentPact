import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = (schema: z.ZodString) => z.preprocess(emptyToUndefined, schema.optional());
const optionalNumber = (schema: z.ZodType<number>) => z.preprocess(emptyToUndefined, schema.optional());

const envSchema = z.object({
  NEXT_PUBLIC_ARC_CHAIN_ID: z.coerce.number().int().positive(),
  NEXT_PUBLIC_ARC_RPC_URL: z.string().url(),
  NEXT_PUBLIC_ARC_EXPLORER_URL: z.string().url(),
  NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS: optionalString(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK: optionalNumber(z.coerce.number().int().nonnegative()),
  NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS: optionalString(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  NEXT_PUBLIC_CIRCLE_APP_ID: optionalString(z.string().min(1)),
  CIRCLE_API_KEY: optionalString(z.string().min(1)),
  CIRCLE_ENTITY_SECRET: optionalString(z.string().min(1)),
  NEXT_PUBLIC_UNSPLASH_ACCESS_KEY: optionalString(z.string().min(1)),
  NEXT_PUBLIC_SUPABASE_URL: optionalString(z.string().url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString(z.string().min(1)),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(z.string().min(1)),
  NEXT_PUBLIC_MOCK_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export type EnvValidationResult =
  | { success: true; env: Env }
  | { success: false; missing: string[]; invalid: { path: string; message: string }[] };

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_ARC_CHAIN_ID",
  "NEXT_PUBLIC_ARC_RPC_URL",
  "NEXT_PUBLIC_ARC_EXPLORER_URL",
  "NEXT_PUBLIC_USDC_CONTRACT_ADDRESS",
] as const;

function validateEnv(): EnvValidationResult {
  const raw = {
    NEXT_PUBLIC_ARC_CHAIN_ID: process.env.NEXT_PUBLIC_ARC_CHAIN_ID,
    NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL,
    NEXT_PUBLIC_ARC_EXPLORER_URL: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL,
    NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS,
    NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS: process.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS,
    NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK,
    NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS: process.env.NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS,
    NEXT_PUBLIC_CIRCLE_APP_ID: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
    CIRCLE_API_KEY: process.env.CIRCLE_API_KEY,
    CIRCLE_ENTITY_SECRET: process.env.CIRCLE_ENTITY_SECRET,
    NEXT_PUBLIC_UNSPLASH_ACCESS_KEY: process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE,
  };

  const missing = REQUIRED_KEYS.filter((key) => !raw[key] || raw[key] === "");

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const invalid = result.error.issues
      .filter((issue) => !missing.includes(issue.path.join(".") as (typeof REQUIRED_KEYS)[number]))
      .map((issue) => ({ path: issue.path.join("."), message: issue.message }));

    if (missing.length > 0 || invalid.length > 0) {
      return { success: false, missing, invalid };
    }
  }

  if (missing.length > 0) {
    return { success: false, missing, invalid: [] };
  }

  return { success: true, env: result.data as Env };
}

export const envResult = validateEnv();
