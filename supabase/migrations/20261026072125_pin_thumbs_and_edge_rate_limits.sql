-- Pin thumbnails plus per-user daily counters for paid edge functions.
-- Counters are service-role only: RLS is on and there are no client policies.

alter table public.memories
    add column if not exists thumb_uri text;

comment on column public.memories.thumb_uri is
    'Public URL of a ~200px JPEG used for map pins. Null until a thumbnail is generated.';

create table if not exists public.edge_daily_requests (
    user_id uuid not null references auth.users (id) on delete cascade,
    endpoint text not null check (char_length(endpoint) between 1 and 80),
    usage_date date not null,
    request_count integer not null default 0 check (request_count >= 0),
    primary key (user_id, endpoint, usage_date)
);

comment on table public.edge_daily_requests is
    'Per-user UTC-day counters for paid edge functions. Written only with the service role.';

alter table public.edge_daily_requests enable row level security;

revoke all on table public.edge_daily_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.edge_daily_requests to service_role;

create or replace function public.consume_edge_daily_request(
    p_user_id uuid,
    p_endpoint text,
    p_usage_date date
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_count integer;
begin
    if p_user_id is null
       or p_endpoint is null
       or length(btrim(p_endpoint)) = 0
       or length(p_endpoint) > 80
       or p_usage_date is null then
        raise exception 'invalid rate limit key';
    end if;

    insert into public.edge_daily_requests as counter (user_id, endpoint, usage_date, request_count)
    values (p_user_id, p_endpoint, p_usage_date, 1)
    on conflict (user_id, endpoint, usage_date)
    do update set request_count = counter.request_count + 1
    returning request_count into v_count;

    return v_count;
end;
$$;

revoke all on function public.consume_edge_daily_request(uuid, text, date) from public, anon, authenticated;
grant execute on function public.consume_edge_daily_request(uuid, text, date) to service_role;

comment on function public.consume_edge_daily_request(uuid, text, date) is
    'Service-role only. Atomically increments one user/endpoint/UTC-day counter and returns the new count.';

-- Keep shared copies of a memo pointing at the same thumbnail.

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
        thumb_uri
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
        src.thumb_uri
    );

    delete from public.pending_shares where id = inv.id;

    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.accept_pending_memo_share(text) to authenticated;

comment on function public.accept_pending_memo_share(text) is
    'Accept single-memo pending_shares invite: copy canonical fields from sender memo, then delete invite.';

-- Hard delete also reports the pin thumbnail so the client can remove it.

create or replace function public.delete_owned_memory(p_memory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_memory public.memories%rowtype;
  v_has_other_members boolean;
  v_has_pending boolean;
  v_has_market boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select *
  into v_memory
  from public.memories
  where id = p_memory_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_memory.user_id <> v_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  if v_memory.deleted_at is not null then
    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;

  select exists (
    select 1
    from public.library_memos lm
    inner join public.library_members m on m.library_id = lm.library_id
    where lm.memo_id = p_memory_id
      and m.user_id <> v_memory.user_id
  )
  into v_has_other_members;

  select exists (
    select 1
    from public.pending_shares ps
    where ps.memory_id = p_memory_id
      and (
        ps.status = 'pending'
        or ps.status like 'library_invite:%'
      )
  )
  into v_has_pending;

  select exists (
    select 1
    from public.market_photos mp
    where mp.source_memory_id = p_memory_id::text
  )
  into v_has_market;

  if v_has_other_members or v_has_pending or v_has_market then
    update public.memories
    set deleted_at = timezone('utc', now())
    where id = p_memory_id
      and user_id = v_user_id;

    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;

  delete from public.library_memos
  where memo_id = p_memory_id;

  delete from public.pending_shares
  where memory_id = p_memory_id;

  delete from public.memories
  where id = p_memory_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'mode', 'deleted',
    'image_url', v_memory.image_url,
    'thumb_uri', v_memory.thumb_uri
  );
end;
$$;

-- Purge returns thumbnail URLs that no remaining memo still references.

create or replace function public.purge_unused_soft_deleted_memories(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_purged integer := 0;
  v_skipped integer := 0;
  v_image_urls jsonb := '[]'::jsonb;
  v_has_pending boolean;
  v_has_market_source boolean;
  v_has_market_image boolean;
  v_has_active_sibling_image boolean;
  v_has_other_thumb boolean;
begin
  for r in
    select m.id, m.image_url, m.thumb_uri
    from public.memories m
    where m.deleted_at is not null
    order by m.deleted_at asc
  loop
    select exists (
      select 1
      from public.pending_shares ps
      where ps.memory_id = r.id
        and (
          ps.status = 'pending'
          or ps.status like 'library_invite:%'
        )
    )
    into v_has_pending;

    select exists (
      select 1
      from public.market_photos mp
      where mp.source_memory_id = r.id::text
    )
    into v_has_market_source;

    if v_has_pending or v_has_market_source then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if r.image_url is not null and trim(r.image_url) <> '' then
      select exists (
        select 1
        from public.market_photos mp
        where mp.image_url = r.image_url
      )
      into v_has_market_image;

      select exists (
        select 1
        from public.memories m2
        where m2.image_url = r.image_url
          and m2.deleted_at is null
          and m2.id <> r.id
      )
      into v_has_active_sibling_image;

      if not v_has_market_image and not v_has_active_sibling_image then
        v_image_urls := v_image_urls || jsonb_build_array(r.image_url);
      end if;
    end if;

    if r.thumb_uri is not null and trim(r.thumb_uri) <> '' then
      select exists (
        select 1
        from public.memories m2
        where m2.thumb_uri = r.thumb_uri
          and m2.id <> r.id
      )
      into v_has_other_thumb;

      if not v_has_other_thumb then
        v_image_urls := v_image_urls || jsonb_build_array(r.thumb_uri);
      end if;
    end if;

    if p_dry_run then
      v_purged := v_purged + 1;
      continue;
    end if;

    delete from public.library_memos where memo_id = r.id;
    delete from public.pending_shares where memory_id = r.id;
    delete from public.memories where id = r.id;
    v_purged := v_purged + 1;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'purged', v_purged,
    'skipped', v_skipped,
    'storage_urls', v_image_urls
  );
end;
$$;

revoke all on function public.purge_unused_soft_deleted_memories(boolean) from public;
grant execute on function public.purge_unused_soft_deleted_memories(boolean) to service_role;

comment on function public.purge_unused_soft_deleted_memories(boolean) is
  'Service-role only: remove soft-deleted memos with no pending share or marketplace source_memory_id.';
