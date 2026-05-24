-- Backfill market_libraries.country from known market_photos.country values.
-- Legacy publishes stored Unknown Location on the library even when photos had a real country.

update public.market_libraries ml
set country = resolved.country
from (
    select
        mp.market_library_id,
        min(mp.country) as country
    from public.market_photos mp
    where mp.country is not null
      and btrim(mp.country) <> ''
      and lower(btrim(mp.country)) <> 'unknown location'
    group by mp.market_library_id
    having count(distinct mp.country) = 1
) resolved
where ml.id = resolved.market_library_id
  and (
    ml.country is null
    or btrim(ml.country) = ''
    or lower(btrim(ml.country)) = 'unknown location'
  );

update public.market_photos mp
set country = ml.country
from public.market_libraries ml
where mp.market_library_id = ml.id
  and ml.country is not null
  and btrim(ml.country) <> ''
  and lower(btrim(ml.country)) <> 'unknown location'
  and (
    mp.country is null
    or btrim(mp.country) = ''
    or lower(btrim(mp.country)) = 'unknown location'
  );
