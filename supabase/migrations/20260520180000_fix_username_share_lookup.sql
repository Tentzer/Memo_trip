-- Backfill profiles.username from auth metadata and resolve shares for legacy accounts.

update public.profiles p
set username = nullif(
    regexp_replace(btrim(u.raw_user_meta_data->>'username'), '\s+', ' ', 'g'),
    ''
)
from auth.users u
where u.id = p.id
  and (p.username is null or length(btrim(p.username)) = 0)
  and u.raw_user_meta_data->>'username' is not null
  and length(btrim(u.raw_user_meta_data->>'username')) > 0;

create or replace function public.email_for_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    canon_input text;
    found_email text;
begin
    canon_input := public.profile_username_canonical(p_username);
    if canon_input is null or length(canon_input) = 0 then
        return null;
    end if;

    select p.email into found_email
    from public.profiles p
    where public.profile_username_canonical(p.username) = canon_input
      and p.username is not null
      and length(btrim(p.username)) > 0
    limit 1;

    if found_email is not null then
        return found_email;
    end if;

    select p.email into found_email
    from public.profiles p
    inner join auth.users u on u.id = p.id
    where public.profile_username_canonical(u.raw_user_meta_data->>'username') = canon_input
    limit 1;

    return found_email;
end;
$$;

grant execute on function public.email_for_username(text) to authenticated;

comment on function public.email_for_username(text) is
    'Returns profiles.email for username match (profiles.username or auth metadata fallback).';
