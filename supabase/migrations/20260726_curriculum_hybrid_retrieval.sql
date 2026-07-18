-- Hybrid retrieval as a SQL function, called via supabase.rpc() from
-- lib/server/curriculum/retrieval.ts. The Supabase JS query builder has no
-- way to express pgvector's `<=>` distance operator or `ts_rank` -- both
-- need to run inside Postgres, not be approximated by fetching rows and
-- sorting client-side (which would defeat the entire purpose of the HNSW
-- and GIN indexes from 20260725_curriculum_engine_schema_phase1.sql at
-- any real scale).
--
-- Blends semantic similarity (cosine, via chunk_embeddings) and keyword
-- relevance (ts_rank, via content_chunks.content_tsv) with a 0.7/0.3
-- weighting favoring semantic match while still rewarding exact keyword
-- hits -- a reasonable default, not a tuned constant; revisit once real
-- retrieval quality data exists.
--
-- Safe to run multiple times.

create or replace function public.match_content_chunks(
  query_embedding vector(1536),
  query_text text,
  filter_course_id uuid,
  filter_document_id uuid default null,
  filter_chapter text default null,
  match_count int default 10
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  chapter text,
  section text,
  topic text,
  subtopic text,
  page_start int,
  page_end int,
  semantic_score float,
  keyword_score float,
  combined_score float
)
language sql
stable
as $$
  with semantic as (
    select cc.id as chunk_id, 1 - (ce.embedding <=> query_embedding) as score
    from public.content_chunks cc
    join public.chunk_embeddings ce on ce.chunk_id = cc.id
    where cc.course_id = filter_course_id
      and (filter_document_id is null or cc.document_id = filter_document_id)
      and (filter_chapter is null or cc.chapter = filter_chapter)
    order by ce.embedding <=> query_embedding
    limit match_count * 3
  ),
  keyword as (
    select cc.id as chunk_id, ts_rank(cc.content_tsv, plainto_tsquery('english', query_text)) as score
    from public.content_chunks cc
    where cc.course_id = filter_course_id
      and (filter_document_id is null or cc.document_id = filter_document_id)
      and (filter_chapter is null or cc.chapter = filter_chapter)
      and query_text is not null
      and cc.content_tsv @@ plainto_tsquery('english', query_text)
    order by score desc
    limit match_count * 3
  ),
  merged as (
    select
      cc.id as chunk_id,
      cc.document_id,
      cc.content,
      cc.chapter,
      cc.section,
      cc.topic,
      cc.subtopic,
      cc.page_start,
      cc.page_end,
      coalesce(s.score, 0) as semantic_score,
      coalesce(k.score, 0) as keyword_score
    from public.content_chunks cc
    left join semantic s on s.chunk_id = cc.id
    left join keyword k on k.chunk_id = cc.id
    where s.chunk_id is not null or k.chunk_id is not null
  )
  select
    chunk_id, document_id, content, chapter, section, topic, subtopic, page_start, page_end,
    semantic_score, keyword_score,
    (semantic_score * 0.7 + keyword_score * 0.3) as combined_score
  from merged
  order by combined_score desc
  limit match_count;
$$;

-- Exact-phrase search (Section 2: "exact phrase search" as a distinct
-- capability from ranked keyword search) -- plainto_tsquery discards exact
-- phrase adjacency, so this uses phraseto_tsquery instead and returns a
-- boolean match rather than a ranked score.
create or replace function public.search_content_chunks_exact_phrase(
  query_text text,
  filter_course_id uuid,
  filter_document_id uuid default null,
  match_count int default 10
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  chapter text,
  section text,
  page_start int,
  page_end int
)
language sql
stable
as $$
  select cc.id as chunk_id, cc.document_id, cc.content, cc.chapter, cc.section, cc.page_start, cc.page_end
  from public.content_chunks cc
  where cc.course_id = filter_course_id
    and (filter_document_id is null or cc.document_id = filter_document_id)
    and cc.content_tsv @@ phraseto_tsquery('english', query_text)
  order by cc.page_start
  limit match_count;
$$;
