-- Resolve login email for share invites by public username (same canonical rules as signup).

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

    return found_email;
end;
$$;

grant execute on function public.email_for_username(text) to authenticated;

comment on function public.email_for_username(text) is
    'Returns profiles.email for a username match (case- and whitespace-insensitive); invite targeting unchanged.';
