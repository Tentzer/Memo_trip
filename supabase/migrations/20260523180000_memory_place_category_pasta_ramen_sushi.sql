-- Add pasta, ramen, sushi place categories (aligned with place_agent + app).

alter type public.memory_place_category add value if not exists 'pasta';
alter type public.memory_place_category add value if not exists 'ramen';
alter type public.memory_place_category add value if not exists 'sushi';

comment on type public.memory_place_category is
    'Allowed place categories for memories; aligned with memo_video_transcribe place_agent.';

comment on column public.memories.place_category is
    'Venue type from import LLM (restaurant, pasta, ramen, sushi, cafe, bar, bakery, attraction, shopping, other).';
