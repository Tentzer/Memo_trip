-- Extra Google Place photo references for the memo details gallery.
-- Index 0 matches the stored pin photo. Later refs are fetched only when swiped to.
-- Nullable: older memos and camera photos have no gallery.

alter table public.memories
    add column if not exists place_photo_refs text[];

comment on column public.memories.place_photo_refs is
    'Up to 5 Google Place photo_reference values. The stored image_url remains the map pin. Extra refs are not fetched until the details gallery.';

create or replace function public.accept_pending_memo_share(p_invite_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    inv public.pending_shares%rowtype;
    src public.memories%rowtype;
    v_email text;
begin
    select email into v_email from public.profiles where id = auth.uid();
    if v_email is null then
        return jsonb_build_object('ok', false, 'error', 'profile_missing');
    end if;

    select * into inv
    from public.pending_shares
    where id::text = trim(p_invite_id)
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'invite_not_found');
    end if;

    if inv.status is distinct from 'pending' then
        return jsonb_build_object('ok', false, 'error', 'invite_not_pending');
    end if;

    if inv.receiver_email is distinct from v_email then
        return jsonb_build_object('ok', false, 'error', 'not_recipient');
    end if;

    select * into src from public.memories where id = inv.memory_id;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'source_memo_missing');
    end if;

    if inv.sender_id is null or src.user_id is distinct from inv.sender_id then
        return jsonb_build_object('ok', false, 'error', 'invite_sender_mismatch');
    end if;

    if src.deleted_at is not null then
        return jsonb_build_object('ok', false, 'error', 'source_memo_archived');
    end if;

    insert into public.memories (
        user_id,
        image_url,
        latitude,
        longitude,
        title,
        description,
        source,
        source_url,
        country,
        formatted_address,
        place_category,
        thumb_uri,
        place_photo_refs
    )
    values (
        auth.uid(),
        src.image_url,
        src.latitude,
        src.longitude,
        src.title,
        src.description,
        src.source,
        src.source_url,
        src.country,
        src.formatted_address,
        src.place_category,
        src.thumb_uri,
        src.place_photo_refs
    );

    delete from public.pending_shares where id = inv.id;

    return jsonb_build_object('ok', true);
end;
$$;
