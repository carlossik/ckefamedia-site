-- Fix CKEFA Media booking RPC access to pgcrypto helpers in Supabase.
-- The booking functions are SECURITY DEFINER functions whose search_path was
-- restricted to public in migration 003. Supabase installs pgcrypto helpers
-- such as gen_random_bytes() in the extensions schema, so include that trusted
-- schema explicitly without changing the function bodies or booking lifecycle.

alter function public.create_media_provisional_booking(
  uuid,
  date,
  time without time zone,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text
)
set search_path = public, extensions;

alter function public.create_media_booking_hold(
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
)
set search_path = public, extensions;

notify pgrst, 'reload schema';
