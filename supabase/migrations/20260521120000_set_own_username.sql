-- Let authenticated users set their public username once (post-OAuth / legacy accounts).

create or replace function public.set_own_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_display text;
  v_available boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_display := nullif(regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g'), '');

  if v_display is null
     or char_length(v_display) < 3
     or char_length(v_display) > 40
     or v_display !~ '^[[:alpha:][:digit:] ''\-]+$'
     or v_display !~ '[[:alpha:]]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_username');
  end if;

  select public.username_is_available(v_display) into v_available;
  if v_available is not true then
    return jsonb_build_object('ok', false, 'error', 'username_taken');
  end if;

  update public.profiles
  set username = v_display
  where id = v_user_id;

  if not found then
    insert into public.profiles (id, email, username)
    select v_user_id, u.email, v_display
    from auth.users u
    where u.id = v_user_id
    on conflict (id) do update
    set username = excluded.username;
  end if;

  return jsonb_build_object('ok', true, 'username', v_display);
end;
$$;

grant execute on function public.set_own_username(text) to authenticated;

comment on function public.set_own_username(text) is
  'Authenticated user sets profiles.username after OAuth or when missing; validates availability.';
