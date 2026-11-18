import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN ?? false }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_request, response) => response.json({ service: 'fairmatch-api', status: 'ok' }));

// Phase 2 adds Supabase JWT verification and Postgres-backed authorization.
// Browser role values are never trusted; roles are loaded from the authenticated profile.
app.listen(Number(process.env.API_PORT ?? 8080), () => console.log('Fairmatch API listening'));
