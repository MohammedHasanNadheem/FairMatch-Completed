# Connect Fairmatch to Supabase

1. Create a new Supabase project for Fairmatch in the region closest to your users.
2. In Supabase, open **Connect** and copy the project URL and publishable key into the local `.env` file:

   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are used by the React web app.
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are used by the Node API.
   - Keep `SUPABASE_SECRET_KEY` only on the Node/deployment server. It must never be used in React or pasted into chat.

3. In the Supabase SQL Editor, apply these migrations in file-name order:

   - `supabase/migrations/20260816_001_core_schema.sql`
   - `supabase/migrations/20260816_002_personas_and_ai.sql`
   - `supabase/migrations/20260816_003_identity_and_governance.sql`
   - `supabase/migrations/20260816_004_opportunities_and_applications.sql`
   - `supabase/migrations/20260816_005_placement_operations.sql`

4. In **Authentication → URL configuration**, add:

   - `http://127.0.0.1:5187` for the local preview.
   - Your final production URL, such as `https://app.fairmatch.in`.

5. Create the first account from Fairmatch, then in the SQL Editor run this only after replacing the placeholder with that account's auth UUID:

```sql
update public.profiles
set role = 'platform_admin'
where id = '<FIRST_AUTH_USER_UUID>';
```

6. Turn on email confirmation and configure your production SMTP provider before launch. Do not disable confirmation for production.

After the values are saved, restart the web and API processes. The registration page will then create real Supabase Auth accounts and the role-request flow will be stored in the database.
