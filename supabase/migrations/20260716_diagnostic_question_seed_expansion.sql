-- Expands the Digital SAT question bank from 24 to 64 published questions
-- (32 Reading and Writing, 32 Math). Still short of the real Full
-- Diagnostic's exact 54 RW / 44 Math per-attempt need (Module 1 + Module 2
-- combined must draw unique questions), but a substantial step up from the
-- original seed -- see lib/server/diagnosticBank.ts's pickByDifficultyDistribution,
-- which tops up from whatever's published rather than failing outright when
-- a tier runs thin.
--
-- Every question below is 100% original, written for this migration --
-- none of it reproduces, paraphrases, or is derived from any real College
-- Board item. Math answers are hand-verified in the migration's own commit
-- message / PR description, not just asserted.
--
-- Same on-conflict-do-nothing safety as the original seed migration.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values
  -- ===================== Reading and Writing (20 new) =====================
  ('reading_writing', 'Craft and Structure', 'Words in context', 'easy', 'multiple_choice',
    'The volunteers arrived at dawn, eager to finish the trail repairs before the ______ afternoon heat made outdoor work unsafe.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"mild"},{"id":"B","text":"scorching"},{"id":"C","text":"pleasant"},{"id":"D","text":"forecasted"}]',
    'B', 'The urgency to finish before the heat becomes unsafe requires an extreme word; "scorching" fits, the others contradict the danger described.'),

  ('reading_writing', 'Information and Ideas', 'Central ideas', 'easy', 'multiple_choice',
    'A city library replaced its overdue fines with a simple reminder-text system. Six months later, the number of returned books on time had risen by eighteen percent, and staff reported that patrons seemed less anxious about visiting the library at all.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"Text reminders replaced fines and were followed by more on-time returns and less patron anxiety."},{"id":"B","text":"Libraries should never charge fines under any circumstances."},{"id":"C","text":"Patrons dislike receiving text messages from libraries."},{"id":"D","text":"The library staff opposed the new reminder system."}]',
    'A', 'The passage reports both outcomes (more on-time returns, less anxiety) that followed the fine-to-reminder switch; the other choices overstate or contradict the passage.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'easy', 'multiple_choice',
    'The recipe, tested by three generations of the same family, calls for a pinch of cinnamon ______ most modern versions leave out entirely.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"that"},{"id":"B","text":"who"},{"id":"C","text":"whom"},{"id":"D","text":"being"}]',
    'A', '"That" correctly introduces a restrictive clause describing the cinnamon (a thing, not a person).'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'easy', 'multiple_choice',
    'The bridge was closed for inspection only one day a year. ______, the engineers used that single day to run every safety test the schedule allowed.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"Similarly,"},{"id":"B","text":"Therefore,"},{"id":"C","text":"In contrast,"},{"id":"D","text":"For instance,"}]',
    'B', 'The engineers'' use of the single available day is a direct consequence of the closure being so rare -- "Therefore" signals that cause-and-effect link.'),

  ('reading_writing', 'Craft and Structure', 'Words in context', 'easy', 'multiple_choice',
    'The debate coach''s feedback was blunt to the point of feeling ______, yet students who could tolerate it improved faster than those coached more gently.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"harsh"},{"id":"B","text":"encouraging"},{"id":"C","text":"vague"},{"id":"D","text":"irrelevant"}]',
    'A', '"Blunt to the point of feeling" signals an unpleasant, cutting quality; "harsh" fits, while the others contradict "blunt".'),

  ('reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'easy', 'multiple_choice',
    'Neither the interns nor the manager ______ available to answer questions during the outage.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"were"},{"id":"B","text":"was"},{"id":"C","text":"are"},{"id":"D","text":"have been"}]',
    'B', 'With "neither...nor," the verb agrees with the closer subject, the singular "manager," so "was" is correct.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'medium', 'multiple_choice',
    'A nutritionist tracked two groups of office workers over eight weeks. The group given standing desks reported no significant change in daily step count, but both groups showed similar improvements in reported energy levels. The nutritionist concluded that the standing desks themselves were not the main driver of the energy improvements.',
    'Which finding from the study most directly supports the nutritionist''s conclusion?',
    '[{"id":"A","text":"The study lasted eight weeks."},{"id":"B","text":"Both groups, with and without standing desks, showed similar energy improvements."},{"id":"C","text":"Office workers were divided into two groups."},{"id":"D","text":"Step count was tracked daily."}]',
    'B', 'If both groups improved similarly regardless of the desks, the desks are unlikely to be the cause -- that shared improvement is the key supporting evidence.'),

  ('reading_writing', 'Craft and Structure', 'Words in context', 'medium', 'multiple_choice',
    'Reviewers called the sequel''s plot twist ______, noting that the same reveal had appeared, almost unchanged, in the studio''s previous three films.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"inventive"},{"id":"B","text":"derivative"},{"id":"C","text":"shocking"},{"id":"D","text":"ambiguous"}]',
    'B', 'A twist that repeats a prior reveal almost unchanged is "derivative," not original -- the other choices contradict that description.'),

  ('reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'medium', 'multiple_choice',
    'The report, along with its supporting spreadsheets, ______ due at the end of the fiscal quarter.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"are"},{"id":"B","text":"is"},{"id":"C","text":"were"},{"id":"D","text":"have been"}]',
    'B', '"Along with its supporting spreadsheets" is a parenthetical that doesn''t change the subject''s number -- the singular "report" takes "is".'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'medium', 'multiple_choice',
    'A student is writing about community gardens and has these notes: (1) Community gardens can reduce a neighborhood''s average summer temperature by providing shade and ground cover. (2) Participants report a stronger sense of neighborhood connection after gardening together. (3) Some cities offer small grants to start a garden plot. (4) Garden plots require regular watering, which can be a challenge during droughts.',
    'The student wants to highlight an environmental benefit of community gardens. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"Community gardens can lower a neighborhood''s average summer temperature through shade and ground cover."},{"id":"B","text":"Participants often feel more connected to their neighbors after gardening together."},{"id":"C","text":"Some cities provide small grants to help residents start a garden plot."},{"id":"D","text":"Garden plots need regular watering, which is difficult during droughts."}]',
    'A', 'Only choice A describes an environmental effect (lower temperature); the others are social, financial, or logistical points from the notes.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'medium', 'multiple_choice',
    'An economist compared prices at farmers markets that accepted only cash to those that also accepted cards. Markets accepting cards saw average per-visit spending rise by thirty percent, even though the number of vendors and the range of goods sold were nearly identical between the two groups.',
    'Which finding from the study most directly supports the idea that payment method, not vendor variety, drove the spending difference?',
    '[{"id":"A","text":"The markets sold similar goods."},{"id":"B","text":"Markets accepting cards had thirty percent higher average spending despite similar vendors and goods."},{"id":"C","text":"The study compared two types of markets."},{"id":"D","text":"Farmers markets are seasonal."}]',
    'B', 'Holding vendor variety roughly constant while spending still differed by payment method isolates payment method as the likely driver.'),

  ('reading_writing', 'Craft and Structure', 'Words in context', 'medium', 'multiple_choice',
    'The startup''s pitch deck was ______ with technical jargon, so the investors asked the team to explain their product in plain language before continuing.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"sparse"},{"id":"B","text":"laden"},{"id":"C","text":"devoid"},{"id":"D","text":"unfamiliar"}]',
    'B', 'Investors asking for plain language implies the deck was heavily loaded with jargon; "laden" fits, while "sparse" and "devoid" contradict that.'),

  ('reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'medium', 'multiple_choice',
    'By the time the inspectors arrived, the crew ______ already sealed the leak and restarted the pump.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"has"},{"id":"B","text":"have"},{"id":"C","text":"had"},{"id":"D","text":"having"}]',
    'C', 'A past action completed before another past action ("by the time... arrived") requires the past perfect "had".'),

  ('reading_writing', 'Information and Ideas', 'Inferences', 'hard', 'multiple_choice',
    'A teacher noticed that students who sat near the front of the classroom asked more questions during lectures, regardless of which subject was being taught, since seating was reassigned randomly every month.',
    'Which choice best describes what the teacher''s observations most strongly suggest?',
    '[{"id":"A","text":"Front-row seating itself, rather than which students sat there, was linked to more questions being asked."},{"id":"B","text":"Only certain students ever ask questions in class."},{"id":"C","text":"The subject being taught determined how many questions were asked."},{"id":"D","text":"Random seating assignments confused the students."}]',
    'A', 'Since seating rotated randomly yet the front-row pattern held regardless of subject or student, the seating position itself is the strongest supported factor.'),

  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'hard', 'multiple_choice',
    'The article begins by profiling a single beekeeper struggling with colony losses, then expands to examine declining bee populations across the entire region, and finally proposes a policy response at the state level.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It moves from an individual case to a regional problem to a proposed solution."},{"id":"B","text":"It contrasts two beekeepers with opposing methods."},{"id":"C","text":"It presents a policy first, then illustrates it with one example."},{"id":"D","text":"It refutes a claim using historical data."}]',
    'A', 'The described order -- one beekeeper, then the region, then a policy proposal -- is exactly a case-to-problem-to-solution structure.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'hard', 'multiple_choice',
    'The archive contained thousands of letters ______ many had never been read since they were first filed away.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":", of which"},{"id":"B","text":"of which"},{"id":"C","text":", from which"},{"id":"D","text":"from which"}]',
    'A', 'A comma is required before the nonrestrictive clause "of which many had never been read," which adds extra information about the letters.'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'hard', 'multiple_choice',
    'The pilot program cut wait times by forty percent in its first month. ______, enrollment dropped sharply once the program expanded citywide and lost its original, smaller-scale staffing ratio.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"Similarly,"},{"id":"B","text":"However,"},{"id":"C","text":"As a result,"},{"id":"D","text":"In addition,"}]',
    'B', 'The second sentence describes a reversal of the first''s success once the program scaled up, requiring a contrast transition.'),

  ('reading_writing', 'Craft and Structure', 'Words in context', 'hard', 'multiple_choice',
    'The senator''s response to the scandal was widely seen as ______, offering neither an apology nor a denial, just a vague promise to look into the matter.',
    'Which choice completes the text with the most logical and precise word?',
    '[{"id":"A","text":"decisive"},{"id":"B","text":"evasive"},{"id":"C","text":"candid"},{"id":"D","text":"apologetic"}]',
    'B', 'Offering neither an apology nor a denial, only vagueness, is the definition of an evasive response.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'hard', 'multiple_choice',
    'A researcher studying sleep found that participants who used a blue-light filter on their phones before bed fell asleep an average of eleven minutes faster than those who did not, even though both groups reported similar amounts of screen time and similar bedtimes.',
    'Which finding from the study most directly supports the idea that the blue-light filter, not screen time or bedtime, affected how quickly participants fell asleep?',
    '[{"id":"A","text":"Both groups had similar screen time and bedtimes, yet filter users fell asleep faster."},{"id":"B","text":"Participants used their phones before bed."},{"id":"C","text":"The study measured how long it took to fall asleep."},{"id":"D","text":"Sleep researchers often study screen time."}]',
    'A', 'Holding screen time and bedtime roughly constant while the outcome still differed by filter use isolates the filter as the likely factor.'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'hard', 'multiple_choice',
    'A student is writing about a small town''s switch to solar streetlights and has these notes: (1) Solar streetlights eliminated the town''s monthly electric bill for street lighting entirely. (2) Installation required no new wiring, since each light is self-contained. (3) A few residents complained the lights were dimmer than the old sodium lamps. (4) The town used savings from lower electric bills to repave two roads.',
    'The student wants to connect the streetlight switch to a concrete financial benefit for the town. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"Solar streetlights are self-contained and required no new wiring during installation."},{"id":"B","text":"Some residents felt the new lights were dimmer than the old sodium lamps."},{"id":"C","text":"By eliminating the electric bill for street lighting, the town freed up savings that funded repaving two roads."},{"id":"D","text":"The switch to solar streetlights took place over several months."}]',
    'C', 'Only choice C ties the switch to a concrete financial outcome (savings that funded road repaving); the others are installation logistics or unrelated complaints.'),

  -- ===================== Math (20 new) =====================
  ('math', 'Algebra', 'Linear equations', 'easy', 'multiple_choice',
    null, 'If 5x - 3 = 27, what is the value of x?',
    '[{"id":"A","text":"4"},{"id":"B","text":"5"},{"id":"C","text":"6"},{"id":"D","text":"7"}]',
    'C', '5x - 3 = 27 -> 5x = 30 -> x = 6.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'easy', 'multiple_choice',
    null, 'A jacket costs $80 after a 20% discount is applied to its original price. What was the original price?',
    '[{"id":"A","text":"$96"},{"id":"B","text":"$100"},{"id":"C","text":"$64"},{"id":"D","text":"$88"}]',
    'B', 'If the original price is p, then 0.8p = 80, so p = 100.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null, 'In a classroom, the ratio of boys to girls is 3 to 4. If there are 12 boys, how many girls are there?',
    null, '16', 'Set up the proportion 3/4 = 12/x. Solving gives x = 16.'),

  ('math', 'Advanced Math', 'Exponents', 'easy', 'multiple_choice',
    null, 'What is the value of (3^4)/(3^2)?',
    '[{"id":"A","text":"3"},{"id":"B","text":"6"},{"id":"C","text":"9"},{"id":"D","text":"27"}]',
    'C', 'Subtracting exponents with the same base: 3^4 / 3^2 = 3^2 = 9.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'easy', 'multiple_choice',
    null, 'In a triangle, two angles measure 50 degrees and 65 degrees. What is the measure of the third angle?',
    '[{"id":"A","text":"55"},{"id":"B","text":"65"},{"id":"C","text":"75"},{"id":"D","text":"115"}]',
    'B', 'A triangle''s angles sum to 180 degrees: 180 - 50 - 65 = 65.'),

  ('math', 'Algebra', 'Linear equations', 'easy', 'student_produced_response',
    null, 'A phone plan charges a flat fee of $20 plus $0.10 per text message. If Maria''s bill was $35, how many text messages did she send?',
    null, '150', '20 + 0.10x = 35 -> 0.10x = 15 -> x = 150.'),

  ('math', 'Algebra', 'Systems', 'medium', 'multiple_choice',
    null, 'If 2x + y = 11 and x - y = 1, what is the value of y?',
    '[{"id":"A","text":"1"},{"id":"B","text":"2"},{"id":"C","text":"3"},{"id":"D","text":"4"}]',
    'C', 'From x - y = 1, x = y + 1. Substituting: 2(y+1) + y = 11 -> 3y + 2 = 11 -> y = 3.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'student_produced_response',
    null, 'If g(x) = 3x - 4, what is the value of x for which g(x) = 11?',
    null, '5', '3x - 4 = 11 -> 3x = 15 -> x = 5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'medium', 'multiple_choice',
    null, 'A data set of six numbers has a mean of 15. If five of the numbers are 10, 12, 14, 18, and 20, what is the sixth number?',
    '[{"id":"A","text":"14"},{"id":"B","text":"15"},{"id":"C","text":"16"},{"id":"D","text":"18"}]',
    'C', 'The six numbers sum to 90. The five given numbers sum to 74, so the sixth is 90 - 74 = 16.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'medium', 'multiple_choice',
    null, 'A circle has a radius of 5. What is its circumference, in terms of π?',
    '[{"id":"A","text":"5π"},{"id":"B","text":"10π"},{"id":"C","text":"25π"},{"id":"D","text":"15π"}]',
    'B', 'Circumference = 2πr = 2π(5) = 10π.'),

  ('math', 'Advanced Math', 'Exponents', 'medium', 'multiple_choice',
    null, 'A population of bacteria doubles every hour. If there are 100 bacteria at time zero, how many bacteria will there be after 3 hours?',
    '[{"id":"A","text":"300"},{"id":"B","text":"400"},{"id":"C","text":"600"},{"id":"D","text":"800"}]',
    'D', '100 * 2^3 = 100 * 8 = 800.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'medium', 'multiple_choice',
    null, 'A store increases the price of an item by 25%, then later decreases the new price by 20%. What is the overall percent change from the original price?',
    '[{"id":"A","text":"-5%"},{"id":"B","text":"0%"},{"id":"C","text":"+5%"},{"id":"D","text":"+20%"}]',
    'B', 'Starting at 100: after +25% it is 125; after -20% it is 125 * 0.8 = 100, which is the original price -- a 0% overall change.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'medium', 'multiple_choice',
    null, 'A ladder 13 feet long leans against a wall, with its base 5 feet from the wall. How many feet up the wall does the ladder reach?',
    '[{"id":"A","text":"8"},{"id":"B","text":"10"},{"id":"C","text":"12"},{"id":"D","text":"13"}]',
    'C', 'By the Pythagorean theorem: sqrt(13^2 - 5^2) = sqrt(169 - 25) = sqrt(144) = 12.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'multiple_choice',
    null, 'A ball''s height in feet is modeled by h(t) = -16t^2 + 64t, where t is time in seconds after launch. At what time does the ball reach its maximum height?',
    '[{"id":"A","text":"1"},{"id":"B","text":"2"},{"id":"C","text":"3"},{"id":"D","text":"4"}]',
    'B', 'The vertex of h(t) = -16t^2 + 64t occurs at t = -b/(2a) = -64/(2*-16) = 2.'),

  ('math', 'Algebra', 'Systems', 'hard', 'student_produced_response',
    null, 'A theater sells adult tickets for $12 and child tickets for $7. One evening, 150 tickets were sold for a total of $1,400. How many adult tickets were sold?',
    null, '70', 'Let a + c = 150 and 12a + 7c = 1400. Substituting c = 150 - a gives 5a = 350, so a = 70.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'hard', 'multiple_choice',
    null, 'In a right triangle, one angle measures 30 degrees and the side opposite that angle has length 6. What is the length of the hypotenuse?',
    '[{"id":"A","text":"6"},{"id":"B","text":"9"},{"id":"C","text":"12"},{"id":"D","text":"6√3"}]',
    'C', 'sin(30 degrees) = 0.5 = opposite/hypotenuse = 6/hypotenuse, so hypotenuse = 6/0.5 = 12.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'hard', 'multiple_choice',
    null, 'A bag contains 4 red marbles, 5 blue marbles, and 3 green marbles. If one marble is drawn at random, what is the probability that it is NOT blue?',
    '[{"id":"A","text":"5/12"},{"id":"B","text":"7/12"},{"id":"C","text":"1/3"},{"id":"D","text":"3/4"}]',
    'B', 'There are 12 marbles total and 5 are blue, so 7 are not blue: probability = 7/12.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'student_produced_response',
    null, 'The product of two consecutive positive integers is 132. What is the smaller integer?',
    null, '11', 'n(n+1) = 132 -> n^2 + n - 132 = 0 -> (n-11)(n+12) = 0, so n = 11 (the positive solution).'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'hard', 'multiple_choice',
    null, 'A circle has an area of 64π. A central angle of 90 degrees cuts out a sector of the circle. What is the area of that sector?',
    '[{"id":"A","text":"8π"},{"id":"B","text":"16π"},{"id":"C","text":"32π"},{"id":"D","text":"64π"}]',
    'B', 'The radius satisfies r^2 = 64, so the sector area is (90/360) * 64π = 16π.'),

  ('math', 'Algebra', 'Linear equations', 'hard', 'student_produced_response',
    null, 'A rectangle''s length is 3 more than twice its width. If the perimeter of the rectangle is 36, what is the width?',
    null, '5', 'Let w be the width; length = 2w + 3. Perimeter: 2(w + 2w + 3) = 6w + 6 = 36, so w = 5.')
) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'digital-sat'
on conflict (exam_id, md5(question_text)) do nothing;
