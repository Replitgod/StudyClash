-- Brings the published bank up to the exact counts a single Full
-- Diagnostic attempt needs: 54 Reading and Writing questions (27 for
-- Module 1 + 27 for Module 2, drawn without repeats) and 44 Math questions
-- (22 + 22). Before this migration the bank had 38 RW / 36 Math -- enough
-- for Module 1 balanced sampling, but Module 2's adaptive pool
-- (pickModule2Questions in lib/server/diagnosticBank.ts, which excludes
-- every question already used in Module 1) would have had to top up from a
-- thin or repeated pool for a chunk of students.
--
-- 16 new Reading and Writing questions and 8 new Math questions, allocated
-- to bring every skill already in the bank to a more even count (roughly
-- 5-6 questions per RW skill, 4-5 per Math skill) rather than padding the
-- skills that already had the most. Same originality guarantee and
-- on-conflict-do-nothing safety as the other seed migrations.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values
  -- ===================== Reading and Writing (16 new) =====================
  ('reading_writing', 'Information and Ideas', 'Central ideas', 'medium', 'multiple_choice',
    'A mid-sized publisher shifted half its catalog to audiobook-first releases, delaying print editions by three months. Over the following two years, audiobook sales in that catalog grew by sixty percent, while print sales for the same titles fell by only eight percent once they finally reached shelves.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"The publisher''s audiobook-first strategy grew audiobook sales substantially while only modestly reducing eventual print sales."},{"id":"B","text":"Audiobooks have completely replaced print books at this publisher."},{"id":"C","text":"Delaying print editions always hurts a publisher''s business."},{"id":"D","text":"Audiobook sales fell after the strategy was introduced."}]',
    'A', 'Both outcomes reported -- strong audiobook growth and only a modest print decline -- support choice A; the others overstate or contradict the passage.'),

  ('reading_writing', 'Information and Ideas', 'Central ideas', 'hard', 'multiple_choice',
    'Public health officials long assumed that a city''s clean-water initiative was the main reason childhood illness rates fell in the 1990s. A later review of hospital admission records found that the decline had already begun five years before the initiative launched, coinciding instead with the citywide rollout of a childhood vaccination program.',
    'Which choice best states the main idea of the text?',
    '[{"id":"A","text":"The clean-water initiative was solely responsible for the drop in childhood illness."},{"id":"B","text":"A vaccination program, not just the clean-water initiative, likely contributed to the earlier decline in childhood illness."},{"id":"C","text":"Hospital admission records from the 1990s are unreliable."},{"id":"D","text":"Childhood illness rates have never changed in this city."}]',
    'B', 'The review complicates the water-only explanation with evidence that the decline began earlier, alongside the vaccination rollout.'),

  ('reading_writing', 'Information and Ideas', 'Inferences', 'easy', 'multiple_choice',
    'A cafe owner noticed that the espresso machine only jammed on mornings when the barista training video played in the back room, never on mornings when it did not, even though different baristas worked each type of morning.',
    'Which choice best describes what the pattern most strongly suggests?',
    '[{"id":"A","text":"Something about the mornings the training video played, not which barista worked, was linked to the jams."},{"id":"B","text":"The espresso machine was jamming randomly."},{"id":"C","text":"Only one barista ever caused jams."},{"id":"D","text":"The training video had nothing to do with the machine."}]',
    'A', 'The jams tracked the video playing regardless of which barista worked, making that the most strongly supported factor.'),

  ('reading_writing', 'Information and Ideas', 'Inferences', 'medium', 'multiple_choice',
    'A city noticed that potholes reported through its new mobile app were repaired twice as fast, on average, as potholes reported by phone call, even though the same repair crews and the same budget covered both types of reports.',
    'Which choice best describes what the city''s data most strongly suggests?',
    '[{"id":"A","text":"The reporting method itself, rather than crew availability or budget, was linked to how quickly a pothole got fixed."},{"id":"B","text":"Phone-reported potholes were larger than app-reported ones."},{"id":"C","text":"The mobile app increased the city''s repair budget."},{"id":"D","text":"Repair crews preferred working on weekends."}]',
    'A', 'With crews and budget held constant, the reporting method is the strongest supported factor behind the speed difference.'),

  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'medium', 'multiple_choice',
    'The op-ed begins by conceding that the city''s new bike lanes have reduced commute times for cyclists, then pivots to argue that the lanes have made deliveries slower for local businesses, and ends by proposing a compromise redesign.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It concedes a benefit, raises a drawback, and proposes a compromise."},{"id":"B","text":"It presents only one side of the issue throughout."},{"id":"C","text":"It tells a chronological history of the bike lanes."},{"id":"D","text":"It compares bike lanes in two different cities."}]',
    'A', 'The described sequence -- concession, drawback, compromise -- matches only choice A.'),

  ('reading_writing', 'Craft and Structure', 'Text structure and purpose', 'easy', 'multiple_choice',
    'The video tutorial starts with a list of required tools, then walks through each assembly step in order, and finishes with a troubleshooting section for common mistakes.',
    'Which choice best describes the overall structure of the text?',
    '[{"id":"A","text":"It lists requirements, walks through steps in order, then addresses common problems."},{"id":"B","text":"It compares two different tutorials."},{"id":"C","text":"It argues against following instructions in order."},{"id":"D","text":"It begins with troubleshooting before explaining the steps."}]',
    'A', 'The order given -- tools, then steps, then troubleshooting -- matches only choice A.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'easy', 'multiple_choice',
    'A teacher gave the same quiz to two classes. The class that reviewed practice questions the night before scored an average of ten points higher than the class that did not, even though both classes had covered identical material in class that week.',
    'Which finding most directly supports the idea that the practice review, not the class material, caused the score difference?',
    '[{"id":"A","text":"Both classes covered the same material that week."},{"id":"B","text":"The reviewing class scored ten points higher despite covering identical material."},{"id":"C","text":"The quiz had multiple-choice questions."},{"id":"D","text":"Two classes took the same quiz."}]',
    'B', 'Holding the class material constant while the outcome still differed by review isolates the review as the likely cause.'),

  ('reading_writing', 'Information and Ideas', 'Evidence', 'hard', 'multiple_choice',
    'An urban planner compared two neighborhoods with nearly identical income levels and population density. The neighborhood with a new pedestrian plaza saw local restaurant revenue rise by twenty percent over two years, while the neighborhood without a plaza saw revenue stay flat over the same period.',
    'Which finding from the study most directly supports the idea that the pedestrian plaza, not income or density, drove the revenue increase?',
    '[{"id":"A","text":"The two neighborhoods had nearly identical income and density, yet only the one with a plaza saw revenue rise."},{"id":"B","text":"Both neighborhoods were studied over two years."},{"id":"C","text":"Restaurant revenue can be measured precisely."},{"id":"D","text":"Urban planners often study neighborhood income levels."}]',
    'A', 'Holding income and density roughly constant while the outcome still differed by plaza presence isolates the plaza as the likely factor.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'medium', 'multiple_choice',
    'The novelist''s fourth book ______ a departure from her usual mystery genre, surprised longtime readers expecting another detective story.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":", being"},{"id":"B","text":", which was"},{"id":"C","text":"being"},{"id":"D","text":"which was"}]',
    'B', 'A comma is needed to set off the nonrestrictive clause "which was a departure..." describing the fourth book.'),

  ('reading_writing', 'Standard English Conventions', 'Boundaries', 'hard', 'multiple_choice',
    'The exhibit featured paintings by four regional artists ______ each contributed a piece exploring the theme of migration.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":", of whom"},{"id":"B","text":"of whom"},{"id":"C","text":", whom"},{"id":"D","text":"whom"}]',
    'A', 'A comma is required before the nonrestrictive clause "of whom each contributed..." describing the four artists.'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'medium', 'multiple_choice',
    'The startup cut its marketing budget by half to extend its runway. ______, user signups continued to grow at nearly the same rate as before the cut.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"Consequently,"},{"id":"B","text":"Surprisingly,"},{"id":"C","text":"Similarly,"},{"id":"D","text":"Specifically,"}]',
    'B', 'Continued growth despite a major budget cut is an unexpected outcome, so "Surprisingly" fits best.'),

  ('reading_writing', 'Expression of Ideas', 'Transitions', 'easy', 'multiple_choice',
    'The museum''s new exhibit required delicate lighting to protect the artifacts. ______, the design team installed dimmable LED fixtures throughout the gallery.',
    'Which choice completes the text with the most logical transition?',
    '[{"id":"A","text":"However,"},{"id":"B","text":"Accordingly,"},{"id":"C","text":"Nonetheless,"},{"id":"D","text":"In contrast,"}]',
    'B', 'Installing dimmable fixtures follows logically from the stated lighting requirement, so "Accordingly" fits.'),

  ('reading_writing', 'Standard English Conventions', 'Form, structure, and sense', 'hard', 'multiple_choice',
    'Not only the lead actor but also the supporting cast members ______ praised for their performances in the reviews.',
    'Which choice completes the text so that it conforms to the conventions of Standard English?',
    '[{"id":"A","text":"was"},{"id":"B","text":"is"},{"id":"C","text":"were"},{"id":"D","text":"has been"}]',
    'C', 'With "not only...but also," the verb agrees with the nearer subject, the plural "supporting cast members," so "were" is correct.'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'easy', 'multiple_choice',
    'A student is writing about a school''s new composting program and has these notes: (1) The program diverts about 200 pounds of food waste from landfills each week. (2) Students volunteer in rotating shifts to sort compostable material. (3) The finished compost is used in the school''s vegetable garden. (4) A few students found the sorting process confusing at first.',
    'The student wants to show how the program creates a complete, closed loop from waste to reuse. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"The program diverts about 200 pounds of food waste from landfills each week."},{"id":"B","text":"Students volunteer in rotating shifts to sort compostable material."},{"id":"C","text":"Food waste collected by the program becomes compost that is then used in the school''s own vegetable garden."},{"id":"D","text":"A few students found the sorting process confusing at first."}]',
    'C', 'Only choice C ties the waste collection directly to its reuse (compost feeding the garden), forming the closed loop the student wants to show.'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'medium', 'multiple_choice',
    'A student is writing about a local library''s tool-lending program and has these notes: (1) The program lends power tools, checked out like books, for home repair projects. (2) Membership in the program is free with a library card. (3) A safety training video is required before a member''s first tool checkout. (4) The program has reduced the number of unreturned tools compared to the library''s earlier, ungoverned tool shelf.',
    'The student wants to emphasize that the program improved on a previous, less structured system. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"The program lends power tools, checked out like books, for home repair projects."},{"id":"B","text":"Membership in the program is free with a library card."},{"id":"C","text":"A safety training video is required before a member''s first checkout."},{"id":"D","text":"Compared to the library''s earlier, ungoverned tool shelf, the new program has reduced the number of unreturned tools."}]',
    'D', 'Only choice D explicitly compares the new program to the earlier, less structured system and shows the improvement.'),

  ('reading_writing', 'Expression of Ideas', 'Rhetorical synthesis', 'hard', 'multiple_choice',
    'A student is writing about a factory''s shift to a four-day work week and has these notes: (1) Weekly output stayed within two percent of the previous five-day schedule. (2) Employee overtime requests dropped by half. (3) The factory redesigned shift handoffs to avoid production gaps. (4) A few long-time employees said they missed the old schedule''s routine.',
    'The student wants to argue that the four-day schedule maintained productivity without relying on more overtime. Which choice most effectively uses the notes to accomplish this goal?',
    '[{"id":"A","text":"The factory redesigned shift handoffs to avoid production gaps."},{"id":"B","text":"A few long-time employees said they missed the old schedule''s routine."},{"id":"C","text":"Weekly output stayed within two percent of the previous schedule even as overtime requests dropped by half."},{"id":"D","text":"Employee overtime requests dropped by half."}]',
    'C', 'Only choice C combines both facts needed for the argument: output held steady while overtime simultaneously fell.'),

  -- ===================== Math (8 new) =====================
  ('math', 'Algebra', 'Linear equations', 'medium', 'student_produced_response',
    null, 'If 4(x - 3) = 2x + 6, what is the value of x?',
    null, '9', '4x - 12 = 2x + 6 -> 2x = 18 -> x = 9.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'hard', 'multiple_choice',
    null, 'A store''s revenue increased from $80,000 to $92,000 over one year. What was the percent increase in revenue?',
    '[{"id":"A","text":"12%"},{"id":"B","text":"15%"},{"id":"C","text":"18%"},{"id":"D","text":"20%"}]',
    'B', '(92,000 - 80,000) / 80,000 = 12,000 / 80,000 = 0.15 = 15%.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null, 'A fruit punch recipe uses juice and soda in a ratio of 5 to 2. If a batch uses 10 cups of juice, how many cups of soda are needed?',
    null, '4', 'Set up the proportion 5/2 = 10/x. Solving gives x = 4.'),

  ('math', 'Advanced Math', 'Exponents', 'medium', 'multiple_choice',
    null, 'What is the value of (2^5)^2?',
    '[{"id":"A","text":"64"},{"id":"B","text":"128"},{"id":"C","text":"512"},{"id":"D","text":"1024"}]',
    'D', 'Multiplying exponents: (2^5)^2 = 2^10 = 1024.'),

  ('math', 'Algebra', 'Systems', 'easy', 'student_produced_response',
    null, 'If y = 3x and x + y = 16, what is the value of x?',
    null, '4', 'Substituting: x + 3x = 16 -> 4x = 16 -> x = 4.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'student_produced_response',
    null, 'If f(x) = x^2 - 4x, for what positive value of x does f(x) = 0?',
    null, '4', 'x^2 - 4x = 0 -> x(x - 4) = 0, so x = 0 or x = 4. The positive value is 4.'),

  ('math', 'Advanced Math', 'Quadratics', 'medium', 'multiple_choice',
    null, 'What are the solutions to x^2 - 9 = 0?',
    '[{"id":"A","text":"x = 3 only"},{"id":"B","text":"x = -3 only"},{"id":"C","text":"x = 3, -3"},{"id":"D","text":"x = 9, -9"}]',
    'C', 'x^2 = 9, so x = 3 or x = -3.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'medium', 'multiple_choice',
    null, 'A circle has a diameter of 14. What is its area, in terms of π?',
    '[{"id":"A","text":"7π"},{"id":"B","text":"14π"},{"id":"C","text":"49π"},{"id":"D","text":"98π"}]',
    'C', 'The radius is half the diameter, 7. Area = πr^2 = 49π.')
) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'digital-sat'
on conflict (exam_id, md5(question_text)) do nothing;
