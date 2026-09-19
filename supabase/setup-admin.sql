-- 1. Create the staff user in Supabase Authentication > Users.
-- 2. Copy that user's UUID and email into the statement below.
-- 3. Run the statement in the Supabase SQL editor.

insert into public.media_admin_users (user_id, email, role, is_active)
values ('ad1e9880-c85e-4ef1-8919-73338f36bcd5', 'info@ckefamedia.com', 'administrator', true)
on conflict (user_id) do update
set email = excluded.email, role = excluded.role, is_active = true;
