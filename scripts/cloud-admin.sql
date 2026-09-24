-- Creates (or repairs) the admin account on a CLOUD Supabase project (DEPLOYMENT.md §2.4, ADR-101).
-- Maintainer only. Paste into Dashboard → SQL editor of the target project (dev first, then prod)
-- and replace the two placeholders below. Needs no secret key: the SQL editor runs as the owner.
--
-- Idempotent: a new email gets a confirmed email+password user; an existing one gets its password
-- reset, its email confirmed and app_metadata.role = 'admin' re-applied. Nothing else changes.
--
-- Afterwards: sign out and back in on /host so the JWT carries the role.
-- Don't commit an edited copy, and delete the saved snippet from the SQL editor afterwards
-- (it keeps the password in the query history). Never reuse the local E2E password on prod.

do $$
declare
  v_email    text := lower(trim('<ADMIN EMAIL>'));
  v_password text := '<ADMIN PASSWORD>';
  v_id       uuid;
begin
  if v_email like '<%' or v_password like '<%' then
    raise exception 'replace <ADMIN EMAIL> and <ADMIN PASSWORD> first';
  end if;
  if length(v_password) < 12 then
    raise exception 'use a password of at least 12 characters';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now(),
      '', '', '', '');
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now());
    raise notice 'created admin %', v_email;
  else
    update auth.users
       set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data  = coalesce(raw_app_meta_data, '{}') || '{"role":"admin"}',
           updated_at         = now()
     where id = v_id;
    raise notice 'admin % already existed: password and role re-applied', v_email;
  end if;
end $$;

-- Check: one row, role = admin, confirmed.
select email, raw_app_meta_data ->> 'role' as role, email_confirmed_at is not null as confirmed
  from auth.users
 where raw_app_meta_data ->> 'role' = 'admin';
