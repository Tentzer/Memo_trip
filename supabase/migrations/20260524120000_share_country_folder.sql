-- Country folders are derived client-side by grouping memories on country, so there is no row to
-- invite anyone into. Sharing one mirrors the folder into a managed library (country_share_of =
-- folder name) and reuses the library_invites flow: recipients read the owner's real memo rows,
-- so titles, descriptions, place categories and import source links stay identical.

alter table public.libraries
    add column if not exists country_share_of text;

comment on column public.libraries.country_share_of is
    'Non-null: managed mirror of the owner country folder with this exact name.';

create unique index if not exists libraries_one_country_share_per_owner
    on public.libraries (owner_id, country_share_of)
    where country_share_of is not null;

-- Memos saved after the invite must reach the same people, and a memo that moves to another
-- country must leave the folder it no longer belongs to.
create or replace function public.sync_memory_into_country_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.library_memos lm
    using public.libraries l
    where lm.memo_id = new.id
      and lm.library_id = l.id
      and l.owner_id = new.user_id
      and l.country_share_of is not null
      and l.country_share_of is distinct from new.country;

    if new.country is null or btrim(new.country) = '' then
        return new;
    end if;

    insert into public.library_memos (library_id, memo_id, added_by)
    select l.id, new.id, new.user_id
    from public.libraries l
    where l.owner_id = new.user_id
      and l.country_share_of = new.country
    on conflict (library_id, memo_id) do nothing;

    return new;
end;
$$;

comment on function public.sync_memory_into_country_share() is
    'Keeps shared country folders complete: a memo joins/leaves the owner mirror library by country.';

drop trigger if exists memories_sync_country_share on public.memories;

create trigger memories_sync_country_share
    after insert or update of country on public.memories
    for each row
    execute function public.sync_memory_into_country_share();
