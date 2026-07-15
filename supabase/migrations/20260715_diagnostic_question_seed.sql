-- Seeds an initial published Digital SAT question bank so the diagnostic
-- flow is actually usable end to end, not just schema with no content.
-- Every question below is 100% original, written for this migration --
-- none of it reproduces, paraphrases, or is derived from any real College
-- Board item. Sized for the Quick Diagnostic (a balanced sample); a Full
-- Diagnostic will need substantially more bank content added through the
-- admin review workflow (app/admin/diagnostics) before it can pull a full
-- 27/27/22/22-question module set without falling back to a thin pool.
--
-- Uses `on conflict (exam_id, md5(question_text)) do nothing` against the
-- exact-duplicate index from 20260715_diagnostics_and_study_plans.sql, so
-- this is safe to run multiple times.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values
  -- ===================== Reading and Writing =====================
  ('reading_writing', 'Craft and Structure', 'Words in context', 'easy', 'multiple_choice',
    'After weeks of drought, the reservoir''s water level had grown alarmingly ______, prompting the city council to enact strict watering restrictions.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"abundant"},{"id":"B","text":"low"},{"id":"C","text":"irrelevant"},{"id":"D","text":"colorful"}]',
    'B', 'The context (drought, watering restrictions) requires a word meaning depleted; "low" fits, while the others contradict the scenario.'),

  ('reading_writing', 'Information and Ideas', 'Central ideas', 'easy', 'multiple_choice',
    'A city planner spent a decade studying how public parks affect nearby home values. Her research, drawn from over two hundred neighborhoods, found that homes within a quarter mile of a well-maintained park sold for an average of eight percent more than similar homes farther away.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"Home values are determined mainly by school district quality."},{"id":"B","text":"Proximity to a well-maintained park is associated with higher home sale prices."},{"id":"C","text":"City planners rarely study the effects of parks."},{"id":"D","text":"Only homes near parks are ever renovated."}]',
    'B', 'The passage''s central finding is the link between park proximity and higher sale prices; the other choices are unsupported or contradicted.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'easy', 'multiple_choice',
    'The museum''s new wing, which opens next spring, will feature interactive exhibits ______ visitors can design their own short films.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"where"},{"id":"B","text":"which"},{"id":"C","text":"who"},{"id":"D","text":"whom"}]',
    'A', '"Where" correctly introduces a clause describing a place (the exhibits) in which an activity occurs.'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'easy', 'multiple_choice',
    'The bakery''s new oven bakes bread twice as fast as the old one. ______, the head baker was hesitant to switch entirely, worried that speed might come at the cost of flavor.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"Similarly,"},{"id":"B","text":"As a result,"},{"id":"C","text":"Nevertheless,"},{"id":"D","text":"For example,"}]',
    'C', 'The second sentence contrasts with the first (faster oven, but hesitation), so a contrast transition is needed.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'medium', 'multiple_choice',
    'Marine biologists tagged forty sea turtles along a coastal migration route and tracked their movements for three years. The data showed that turtles consistently avoided areas with heavy boat traffic, even when those areas contained abundant food sources. The researchers concluded that noise and vibration from boat engines, not food scarcity, primarily drove the turtles'' route choices.',
    'Which finding from the study most directly supports the researchers'' conclusion?',
    '[{"id":"A","text":"Turtles were tagged for exactly three years."},{"id":"B","text":"Turtles avoided high-traffic areas even where food was abundant."},{"id":"C","text":"Forty turtles were included in the study."},{"id":"D","text":"The study focused on a single migration route."}]',
    'B', 'Avoidance despite abundant food is the specific evidence that isolates engine noise/vibration, not food scarcity, as the cause.'),

  ('reading_writing', 'Craft and Structure', 'Words in context', 'medium', 'multiple_choice',
    'Critics initially dismissed the young violinist''s interpretation as too unconventional, but audiences found her willingness to depart from tradition ______ rather than distracting.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"tedious"},{"id":"B","text":"invigorating"},{"id":"C","text":"forgettable"},{"id":"D","text":"predictable"}]',
    'B', 'The contrast word "rather than distracting" signals a positive quality; "invigorating" fits, the others do not.'),

  ('reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'medium', 'multiple_choice',
    'Each of the interns, despite having only a few weeks of experience, ______ expected to submit a full project proposal by Friday.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"were"},{"id":"B","text":"are"},{"id":"C","text":"is"},{"id":"D","text":"have been"}]',
    'C', '"Each" is singular, so the verb must agree in number: "is".'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'medium', 'multiple_choice',
    'A student is writing a report on urban beekeeping and has gathered these notes: (1) Urban beehives can pollinate rooftop gardens within a two-mile radius. (2) Rooftop gardens increase insulation, lowering building energy costs. (3) Local ordinances in several cities now permit registered hobbyist hives. (4) Beekeeping requires basic protective equipment and periodic hive inspections.',
    'The student wants to emphasize a benefit that connects beekeeping directly to building energy efficiency. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"Urban beehives can pollinate gardens within a two-mile radius, making them useful across a whole neighborhood."},{"id":"B","text":"Because rooftop gardens pollinated by urban hives improve insulation, beekeeping can indirectly lower a building''s energy costs."},{"id":"C","text":"Beekeeping requires only basic protective equipment, making it accessible to most hobbyists."},{"id":"D","text":"Several cities now allow registered hobbyist hives under local ordinances."}]',
    'B', 'Only choice B links beekeeping to building energy efficiency, combining notes 1 and 2 into a single cause-and-effect claim.'),

  ('reading_writing', 'Information and Ideas', 'Inferences', 'hard', 'multiple_choice',
    'A factory manager noticed that defect rates fell sharply every time a particular supervisor was on shift, regardless of which workers were present or which products were being made. When that supervisor took a two-week vacation, defect rates returned to their previous, higher level almost immediately.',
    'Which choice best describes what the manager''s observations most strongly suggest?',
    '[{"id":"A","text":"The factory''s equipment was poorly maintained during the vacation."},{"id":"B","text":"The supervisor''s presence, rather than worker or product variation, was linked to lower defect rates."},{"id":"C","text":"Defect rates are unrelated to supervision."},{"id":"D","text":"The workers preferred the supervisor''s leadership style."}]',
    'B', 'The defect rate tracked the supervisor''s presence regardless of other variables, and reverted when she left -- the strongest supported inference.'),

  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'hard', 'multiple_choice',
    'The essay opens by describing a single abandoned lighthouse in vivid detail, then gradually widens its focus to discuss the decline of lighthouse keeping as a profession across the entire coastline.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It presents two competing arguments and resolves them with a compromise."},{"id":"B","text":"It moves from a specific example to a broader discussion of a general trend."},{"id":"C","text":"It compares two lighthouses in different countries."},{"id":"D","text":"It refutes a common misconception using statistical evidence."}]',
    'B', 'The description explicitly narrows-to-wide: one lighthouse, then the broader trend across the coastline.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'hard', 'multiple_choice',
    'The committee reviewed three proposals ______ one focused on renewable energy, one on public transit, and one on affordable housing.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"proposals,"},{"id":"B","text":"proposals:"},{"id":"C","text":"proposals;"},{"id":"D","text":"proposals"}]',
    'B', 'A colon correctly introduces the list that explains what the three proposals were.'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'hard', 'multiple_choice',
    'The new traffic algorithm reduced average commute times by twelve percent in simulation testing. ______, when deployed on actual city streets, commute times improved by less than two percent, revealing a significant gap between simulated and real-world performance.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"Consequently,"},{"id":"B","text":"In fact,"},{"id":"C","text":"However,"},{"id":"D","text":"Specifically,"}]',
    'C', 'The second sentence contrasts sharply with the simulated result, requiring a contrast transition.'),

  -- ===================== Math =====================
  ('math', 'Algebra', 'Linear equations', 'easy', 'multiple_choice',
    null, 'If 3x + 7 = 22, what is the value of x?',
    '[{"id":"A","text":"3"},{"id":"B","text":"5"},{"id":"C","text":"7"},{"id":"D","text":"9"}]',
    'B', '3x + 7 = 22 -> 3x = 15 -> x = 5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'easy', 'multiple_choice',
    null, 'A shirt originally priced at $40 is on sale for 25% off. What is the sale price?',
    '[{"id":"A","text":"$10"},{"id":"B","text":"$28"},{"id":"C","text":"$30"},{"id":"D","text":"$35"}]',
    'C', '25% of $40 is $10, so the sale price is $40 - $10 = $30.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null, 'A recipe calls for 2 cups of flour for every 3 cups of water. If a chef uses 9 cups of water, how many cups of flour are needed?',
    null, '6', 'Set up the proportion 2/3 = x/9. Solving gives x = 6.'),

  ('math', 'Advanced Math', 'Exponents', 'easy', 'multiple_choice',
    null, 'What is the value of 2^3 * 2^2?',
    '[{"id":"A","text":"16"},{"id":"B","text":"32"},{"id":"C","text":"64"},{"id":"D","text":"10"}]',
    'B', 'Adding exponents with the same base: 2^3 * 2^2 = 2^5 = 32.'),

  ('math', 'Algebra', 'Systems', 'medium', 'student_produced_response',
    null, 'If x + y = 10 and x - y = 4, what is the value of x?',
    null, '7', 'Adding the two equations gives 2x = 14, so x = 7.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'multiple_choice',
    null, 'If f(x) = 2x^2 - 3, what is f(3)?',
    '[{"id":"A","text":"9"},{"id":"B","text":"12"},{"id":"C","text":"15"},{"id":"D","text":"18"}]',
    'C', 'f(3) = 2(3)^2 - 3 = 2(9) - 3 = 15.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'medium', 'multiple_choice',
    null, 'The average (arithmetic mean) of five numbers is 20. If one of the numbers is removed and the average of the remaining four numbers is 18, what was the value of the number that was removed?',
    '[{"id":"A","text":"22"},{"id":"B","text":"24"},{"id":"C","text":"26"},{"id":"D","text":"28"}]',
    'D', 'Sum of five numbers = 100. Sum of remaining four = 72. Removed number = 100 - 72 = 28.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'medium', 'multiple_choice',
    null, 'A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?',
    '[{"id":"A","text":"10"},{"id":"B","text":"12"},{"id":"C","text":"14"},{"id":"D","text":"9"}]',
    'A', 'By the Pythagorean theorem, sqrt(6^2 + 8^2) = sqrt(36 + 64) = sqrt(100) = 10.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'multiple_choice',
    null, 'What are the solutions to x^2 - 5x + 6 = 0?',
    '[{"id":"A","text":"x = 1, 6"},{"id":"B","text":"x = 2, 3"},{"id":"C","text":"x = -2, -3"},{"id":"D","text":"x = 2, -3"}]',
    'B', 'Factoring gives (x - 2)(x - 3) = 0, so x = 2 or x = 3.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'hard', 'multiple_choice',
    null, 'A circle has a circumference of 18π. What is the area of the circle?',
    '[{"id":"A","text":"9π"},{"id":"B","text":"18π"},{"id":"C","text":"81π"},{"id":"D","text":"162π"}]',
    'C', 'Circumference = 2πr = 18π, so r = 9. Area = πr^2 = 81π.'),

  ('math', 'Algebra', 'Systems', 'hard', 'student_produced_response',
    null, 'A company sells two types of tickets: standard tickets for $15 and VIP tickets for $40. On a night when 200 tickets were sold for a total of $4,250, how many VIP tickets were sold?',
    null, '50', 'Let s + v = 200 and 15s + 40v = 4250. Substituting s = 200 - v gives 25v = 1250, so v = 50.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'hard', 'multiple_choice',
    null, 'In a survey of 300 students, 180 said they prefer online classes. If the survey''s margin of error is plus or minus 4 percentage points, which of the following is closest to the range of the true percentage of all students who prefer online classes?',
    '[{"id":"A","text":"56% to 64%"},{"id":"B","text":"50% to 70%"},{"id":"C","text":"40% to 80%"},{"id":"D","text":"60% to 60%"}]',
    'A', '180/300 = 60%. Applying the +/- 4 point margin of error gives a range of 56% to 64%.')
) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'digital-sat'
on conflict (exam_id, md5(question_text)) do nothing;
