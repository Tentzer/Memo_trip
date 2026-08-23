-- Public display name on profiles (nullable for legacy rows). New signups set via auth trigger + raw_user_meta_data.username.
-- Uniqueness is case- and internal-whitespace-insensitive; stored value keeps user casing (e.g. "Bon Jovi").

alter table public.profiles
    add column if not exists username text;

comment on column public.profiles.username is 'Public display name; uniqueness ignores case and extra spaces.';

create or replace function public.profile_username_canonical(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
    select lower(regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g'));
$$;

drop index if exists public.profiles_username_normalized_uq;

create unique index profiles_username_normalized_uq
    on public.profiles (public.profile_username_canonical(username))
    where username is not null
      and length(btrim(username)) > 0;

-- Callable by anon before signUp (security definer; no row data exposed).
create or replace function public.username_is_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    display_norm text;
    canon text;
begin
    display_norm := nullif(regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g'), '');
    if display_norm is null then
        return false;
    end if;
    if char_length(display_norm) < 3 or char_length(display_norm) > 40 then
        return false;
    end if;
    if display_norm !~ '^[[:alpha:][:digit:] ''\-]+$' then
        return false;
    end if;
    if display_norm !~ '[[:alpha:]]' then
        return false;
    end if;

    canon := lower(display_norm);
    return not exists (
        select 1
        from public.profiles p
        where public.profile_username_canonical(p.username) = canon
    );
end;
$$;

grant execute on function public.username_is_available(text) to anon, authenticated;

-- Keeps profiles in sync with Supabase Auth. Extends the usual template to persist username from sign-up metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_username text;
begin
    v_username := nullif(regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '\s+', ' ', 'g'), '');

    insert into public.profiles (id, email, username)
    values (new.id, new.email, v_username)
    on conflict (id) do update
    set
        email = excluded.email,
        username = coalesce(nullif(excluded.username, ''), public.profiles.username);

    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger t
        join pg_class c on t.tgrelid = c.oid
        join pg_namespace n on c.relnamespace = n.oid
        where n.nspname = 'auth'
          and c.relname = 'users'
          and not t.tgisinternal
          and t.tgname = 'on_auth_user_created'
    ) then
        create trigger on_auth_user_created
            after insert on auth.users
            for each row
            execute function public.handle_new_user();
    end if;
end $$;
