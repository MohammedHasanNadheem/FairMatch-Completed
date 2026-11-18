import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  APP_ORIGIN: z.string().url().optional(),
  ANDROID_APP_ORIGIN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
});

export type FairMatchEnvironment = z.infer<typeof environmentSchema>;

/** Reads configuration at request time so a Vercel deployment can use environment variables. */
export function readEnvironment(): FairMatchEnvironment {
  return environmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
    ANDROID_APP_ORIGIN: process.env.ANDROID_APP_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  });
}

export function requireDatabaseEnvironment() {
  const environment = readEnvironment();
  if (!environment.DATABASE_URL || !environment.JWT_SECRET) {
    throw new Error("FairMatch API is not configured. Add DATABASE_URL and a 32+ character JWT_SECRET in Vercel.");
  }
  return environment as FairMatchEnvironment & { DATABASE_URL: string; JWT_SECRET: string };
}
