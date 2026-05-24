-- Admin purge: hard-delete soft-deleted memos that nothing still references.

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
begin
  for r in
    select m.id, m.image_url
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
