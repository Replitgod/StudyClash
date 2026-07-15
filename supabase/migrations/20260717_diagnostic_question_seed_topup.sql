-- Targeted top-up, not another broad batch. After the first two seed
-- migrations, five skills had only 2 published questions each -- too thin
-- for the weakest/strongest-skill signal to mean anything (see
-- computeDiagnosticResults in lib/server/diagnosticBank.ts, which now
-- Laplace-smooths rankings and flags anything under 3 questions as
-- lowConfidence specifically because of this gap). This migration adds
-- exactly 2 new questions to each of those 5 skills -- filling the missing
-- difficulty tiers, not duplicating what's already there -- bringing every
-- skill in the bank to a minimum of 4 questions.
--
-- Same originality guarantee and on-conflict-do-nothing safety as the
-- other seed migrations.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values
  -- Central ideas had 2 easy -- add medium + hard.
  ('reading_writing', 'Information and Ideas', 'Central ideas', 'medium', 'multiple_choice',
    'A regional hospital piloted a program pairing new nurses with a mentor for their first ninety days. Nurses in the program left within their first year at less than half the rate of nurses hired the previous year, before the program existed.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"The mentorship program was linked to a sharp drop in new-nurse turnover."},{"id":"B","text":"Nursing is a more difficult profession than it used to be."},{"id":"C","text":"Hospitals rarely track how long new employees stay."},{"id":"D","text":"All nurses hired before the program left within a year."}]',
    'A', 'The passage''s point is the drop in turnover associated with the mentorship program; the other choices are unsupported or overstated.'),

  ('reading_writing', 'Information and Ideas', 'Central ideas', 'hard', 'multiple_choice',
    'A historian re-examined a decades-old assumption that a medieval town''s decline was caused solely by plague. Reviewing tax and trade records, the historian found that the town''s trade revenue had already been falling for twenty years before the plague arrived, driven by a new overland route that bypassed the town entirely.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"The plague was the sole cause of the town''s decline."},{"id":"B","text":"A new trade route, not just the plague, contributed to the town''s decline."},{"id":"C","text":"Historians never revisit old assumptions about the past."},{"id":"D","text":"Tax records from medieval towns no longer exist."}]',
    'B', 'The passage complicates the plague-only explanation with evidence of an earlier, separate cause (the bypassing trade route).'),

  -- Inferences had 2 hard -- add easy + medium.
  ('reading_writing', 'Information and Ideas', 'Inferences', 'easy', 'multiple_choice',
    'Every time the office thermostat was set below 68 degrees, at least one employee filed a complaint by the end of the day. When the thermostat stayed at 70 degrees or above, no complaints were filed for the rest of that month.',
    'Which choice best describes what the pattern most strongly suggests?',
    '[{"id":"A","text":"Employees generally prefer warmer office temperatures."},{"id":"B","text":"The thermostat was broken."},{"id":"C","text":"Complaints were unrelated to temperature."},{"id":"D","text":"Employees complain regardless of the setting."}]',
    'A', 'Complaints tracked the lower setting and stopped at the higher one, which most directly supports a preference for warmer temperatures.'),

  ('reading_writing', 'Information and Ideas', 'Inferences', 'medium', 'multiple_choice',
    'A wildlife photographer found that a normally shy fox family allowed her to approach closely only on mornings after a light rain, never on dry mornings, regardless of the season or which member of the family was nearby.',
    'Which choice best describes what the photographer''s observation most strongly suggests?',
    '[{"id":"A","text":"Recent rain, rather than season or which fox was present, was linked to the foxes tolerating closer approach."},{"id":"B","text":"The foxes were used to photographers in general."},{"id":"C","text":"The season determined how close the foxes would allow her."},{"id":"D","text":"The fox family included more members on rainy mornings."}]',
    'A', 'Since the pattern held regardless of season or which fox was present, recent rain is the strongest supported factor.'),

  -- Text structure and purpose had 2 hard -- add easy + medium.
  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'easy', 'multiple_choice',
    'The article opens with a short definition of urban heat islands, then lists three cities using reflective rooftops to address the problem.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It defines a concept, then gives examples of a response to it."},{"id":"B","text":"It argues two opposing positions without resolution."},{"id":"C","text":"It tells a personal story about visiting three cities."},{"id":"D","text":"It disproves a widely held scientific theory."}]',
    'A', 'The passage moves from a definition to concrete examples of cities responding to the defined problem.'),

  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'medium', 'multiple_choice',
    'The essay first summarizes a critic''s harsh review of a novel, then presents excerpts from the novel that seem to directly contradict the critic''s specific claims, and closes by inviting readers to judge the book for themselves.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It presents a critique, offers counter-evidence to that critique, and leaves the final judgment open."},{"id":"B","text":"It summarizes the novel''s plot in chronological order."},{"id":"C","text":"It compares the novel to an earlier work by the same author."},{"id":"D","text":"It refutes the critic using the critic''s own biography."}]',
    'A', 'The order described -- critique, counter-evidence, open invitation to judge -- matches only choice A.'),

  -- Ratios had 2 easy -- add medium + hard.
  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'medium', 'student_produced_response',
    null, 'A map has a scale where 2 inches represents 15 miles. If two cities are 7 inches apart on the map, how many miles apart are they in reality?',
    null, '52.5', 'Set up the proportion 2/15 = 7/x. Solving gives x = 15 * 7 / 2 = 52.5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'hard', 'multiple_choice',
    null, 'A paint mixture uses blue and yellow paint in a ratio of 5 to 3 to make green paint. If a painter wants to make 40 liters of this green paint, how many liters of blue paint are needed?',
    '[{"id":"A","text":"15"},{"id":"B","text":"20"},{"id":"C","text":"25"},{"id":"D","text":"30"}]',
    'C', 'The ratio has 8 total parts, and blue is 5 of them: (5/8) * 40 = 25 liters.'),

  -- Functions had 2 medium -- add easy + hard.
  ('math', 'Advanced Math', 'Functions', 'easy', 'student_produced_response',
    null, 'If h(x) = x + 6, what is the value of h(4)?',
    null, '10', 'h(4) = 4 + 6 = 10.'),

  ('math', 'Advanced Math', 'Functions', 'hard', 'multiple_choice',
    null, 'If p(x) = 2x^2 + 3x - 5, what is the value of p(-2)?',
    '[{"id":"A","text":"-3"},{"id":"B","text":"3"},{"id":"C","text":"9"},{"id":"D","text":"15"}]',
    'A', 'p(-2) = 2(4) + 3(-2) - 5 = 8 - 6 - 5 = -3.')
) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'digital-sat'
on conflict (exam_id, md5(question_text)) do nothing;
