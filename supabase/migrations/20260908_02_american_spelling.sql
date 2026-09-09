-- American spelling in the question banks.
--
-- The exams AceDecks prepares people for are all American -- the SAT, the
-- ACT, the MCAT, the NCLEX, the GRE -- and the questions shipped in British
-- English. "The enzyme catalysed the reaction" is not something the MCAT
-- would ever print, and a student who notices is right to conclude that
-- nobody checked.
--
-- The seed files have been corrected, but they insert with ON CONFLICT DO
-- NOTHING, so a database that already ran them keeps the old text forever.
-- This rewrites the rows in place.
--
-- Word boundaries matter more than they look. A plain replace() of "centre"
-- turns "centred" into "centerd", and "practise" inside "practised" leaves
-- "practiced" only by luck. \y is Postgres's word boundary, so each pattern
-- matches whole words and nothing else.
--
-- Idempotent: running it twice finds nothing to change, because the British
-- forms are gone after the first run.

do $$
declare
  pairs text[][] := array[
    ['behaviours', 'behaviors'], ['behaviour', 'behavior'],
    ['Behaviours', 'Behaviors'], ['Behaviour', 'Behavior'],
    ['catalysed', 'catalyzed'], ['catalyses', 'catalyzes'], ['catalysing', 'catalyzing'],
    ['analysed', 'analyzed'], ['analysing', 'analyzing'], ['analyse', 'analyze'],
    ['neighbourhoods', 'neighborhoods'], ['neighbourhood', 'neighborhood'],
    ['neighbouring', 'neighboring'], ['neighbours', 'neighbors'], ['neighbour', 'neighbor'],
    ['colourless', 'colorless'], ['colours', 'colors'], ['colour', 'color'],
    ['Colour', 'Color'],
    ['centres', 'centers'], ['centre', 'center'], ['Centre', 'Center'],
    ['travelled', 'traveled'], ['travelling', 'traveling'],
    ['practising', 'practicing'], ['practised', 'practiced'],
    ['practises', 'practices'], ['practise', 'practice'], ['Practise', 'Practice'],
    ['organisations', 'organizations'], ['organisation', 'organization'],
    ['organised', 'organized'], ['organise', 'organize'],
    ['normalised', 'normalized'], ['normalises', 'normalizes'], ['normalise', 'normalize'],
    ['labelling', 'labeling'], ['labelled', 'labeled'],
    ['labour', 'labor'], ['favourite', 'favorite'], ['honour', 'honor'],
    ['recognised', 'recognized'], ['recognises', 'recognizes'], ['recognise', 'recognize'],
    ['summarised', 'summarized'], ['summarise', 'summarize'],
    ['prioritisation', 'prioritization'], ['prioritised', 'prioritized'],
    ['prioritises', 'prioritizes'], ['prioritise', 'prioritize'],
    ['Prioritisation', 'Prioritization'],
    ['judgements', 'judgments'], ['judgement', 'judgment'], ['Judgement', 'Judgment'],
    ['defence', 'defense'], ['licence', 'license'],
    ['metres', 'meters'], ['metre', 'meter'],
    ['litres', 'liters'], ['litre', 'liter'],
    ['fibre', 'fiber'], ['fibres', 'fibers'],
    ['maximise', 'maximize'], ['minimise', 'minimize'],
    ['utilise', 'utilize'], ['utilised', 'utilized'],
    ['realised', 'realized'], ['realise', 'realize'],
    ['emphasise', 'emphasize'], ['emphasised', 'emphasized'],
    ['specialised', 'specialized'], ['specialise', 'specialize'],
    ['standardised', 'standardized'], ['standardise', 'standardize'],
    ['hospitalised', 'hospitalized'], ['immunisation', 'immunization'],
    ['oesophagus', 'esophagus'], ['haemoglobin', 'hemoglobin'],
    ['anaemia', 'anemia'], ['oedema', 'edema'], ['diarrhoea', 'diarrhea'],
    ['paediatric', 'pediatric'], ['anaesthetic', 'anesthetic'],
    ['haemorrhage', 'hemorrhage'], ['foetal', 'fetal']
  ];
  british text;
  american text;
  pattern text;
  touched integer;
  total integer := 0;
begin
  for i in 1 .. array_length(pairs, 1) loop
    british := pairs[i][1];
    american := pairs[i][2];
    pattern := '\y' || british || '\y';

    update public.diagnostic_questions
    set
      question_text = regexp_replace(question_text, pattern, american, 'g'),
      stimulus = case
        when stimulus is null then null
        else regexp_replace(stimulus, pattern, american, 'g')
      end,
      explanation = regexp_replace(explanation, pattern, american, 'g'),
      answer_choices = case
        when answer_choices is null then null
        else regexp_replace(answer_choices::text, pattern, american, 'g')::jsonb
      end
    where
      question_text ~ pattern
      or (stimulus is not null and stimulus ~ pattern)
      or explanation ~ pattern
      or (answer_choices is not null and answer_choices::text ~ pattern);

    get diagnostics touched = row_count;
    total := total + touched;
  end loop;

  raise notice 'American spelling: % row updates across % word pairs', total, array_length(pairs, 1);
end
$$;

-- The exam definitions carry prose too -- disclaimers and section labels.
update public.exam_definitions
set disclaimer = regexp_replace(disclaimer, '\yjudgement\y', 'judgment', 'g')
where disclaimer ~ '\yjudgement\y';
