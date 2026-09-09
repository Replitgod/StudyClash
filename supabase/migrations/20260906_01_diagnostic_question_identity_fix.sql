-- A question is its stimulus AND its stem, not its stem alone.
--
-- diagnostic_questions has carried a unique index on (exam_id,
-- md5(question_text)) since the diagnostics center was built, and every seed
-- migration inserts with "on conflict ... do nothing". On most exams that is
-- fine. On the Digital SAT it is not, because the stem is boilerplate: every
-- words-in-context item asks "Which choice completes the text with the most
-- logical and precise word?" and the question is the passage above it.
--
-- So 32 of the 98 seeded SAT questions were silently discarded on insert.
-- Nothing errored. The migrations said 98 and the bank held 66 -- a third of
-- the Digital SAT bank has never existed in any deployed database, which is
-- why the Full Diagnostic was thin on Reading and Writing items.
--
-- Two changes:
--
--   1. Identity becomes the stimulus and the stem together. A separator that
--      cannot occur in either -- a unit separator, written as the constant
--      E'\x1f' rather than chr(31) so the index expression needs no
--      argument about function volatility -- sits between them, so a
--      stimulus ending where a stem begins cannot collide with the reverse
--      split.
--   2. The four SAT seeds are replayed under the new identity, which inserts
--      exactly the rows that were lost and does nothing for the rows that
--      landed. The originals are left untouched: a migration that has already
--      run somewhere is history, and rewriting it fixes nobody's database.
--
-- Safe to run more than once.

drop index if exists public.diagnostic_questions_exam_text_unique;

create unique index if not exists diagnostic_questions_exam_item_unique
  on public.diagnostic_questions (exam_id, md5(coalesce(stimulus, '') || E'\x1f' || question_text));

comment on index public.diagnostic_questions_exam_item_unique is
  'Exact-duplicate guard. Keyed on stimulus AND question text: on the Digital SAT the stem is boilerplate and the item is the passage, so keying on the stem alone silently dropped a third of the bank.';

-- ============================================================
-- The Digital SAT bank, replayed under the corrected identity
-- ============================================================

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

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

  ('math', 'Algebra', 'Linear equations', 'easy', 'multiple_choice',
    null,
    'If 3x + 7 = 22, what is the value of x?',
    '[{"id":"A","text":"3"},{"id":"B","text":"5"},{"id":"C","text":"7"},{"id":"D","text":"9"}]',
    'B', '3x + 7 = 22 -> 3x = 15 -> x = 5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'easy', 'multiple_choice',
    null,
    'A shirt originally priced at $40 is on sale for 25% off. What is the sale price?',
    '[{"id":"A","text":"$10"},{"id":"B","text":"$28"},{"id":"C","text":"$30"},{"id":"D","text":"$35"}]',
    'C', '25% of $40 is $10, so the sale price is $40 - $10 = $30.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null,
    'A recipe calls for 2 cups of flour for every 3 cups of water. If a chef uses 9 cups of water, how many cups of flour are needed?',
    null,
    '6', 'Set up the proportion 2/3 = x/9. Solving gives x = 6.'),

  ('math', 'Advanced Math', 'Exponents', 'easy', 'multiple_choice',
    null,
    'What is the value of 2^3 * 2^2?',
    '[{"id":"A","text":"16"},{"id":"B","text":"32"},{"id":"C","text":"64"},{"id":"D","text":"10"}]',
    'B', 'Adding exponents with the same base: 2^3 * 2^2 = 2^5 = 32.'),

  ('math', 'Algebra', 'Systems', 'medium', 'student_produced_response',
    null,
    'If x + y = 10 and x - y = 4, what is the value of x?',
    null,
    '7', 'Adding the two equations gives 2x = 14, so x = 7.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'multiple_choice',
    null,
    'If f(x) = 2x^2 - 3, what is f(3)?',
    '[{"id":"A","text":"9"},{"id":"B","text":"12"},{"id":"C","text":"15"},{"id":"D","text":"18"}]',
    'C', 'f(3) = 2(3)^2 - 3 = 2(9) - 3 = 15.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'medium', 'multiple_choice',
    null,
    'The average (arithmetic mean) of five numbers is 20. If one of the numbers is removed and the average of the remaining four numbers is 18, what was the value of the number that was removed?',
    '[{"id":"A","text":"22"},{"id":"B","text":"24"},{"id":"C","text":"26"},{"id":"D","text":"28"}]',
    'D', 'Sum of five numbers = 100. Sum of remaining four = 72. Removed number = 100 - 72 = 28.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'medium', 'multiple_choice',
    null,
    'A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?',
    '[{"id":"A","text":"10"},{"id":"B","text":"12"},{"id":"C","text":"14"},{"id":"D","text":"9"}]',
    'A', 'By the Pythagorean theorem, sqrt(6^2 + 8^2) = sqrt(36 + 64) = sqrt(100) = 10.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'multiple_choice',
    null,
    'What are the solutions to x^2 - 5x + 6 = 0?',
    '[{"id":"A","text":"x = 1, 6"},{"id":"B","text":"x = 2, 3"},{"id":"C","text":"x = -2, -3"},{"id":"D","text":"x = 2, -3"}]',
    'B', 'Factoring gives (x - 2)(x - 3) = 0, so x = 2 or x = 3.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'hard', 'multiple_choice',
    null,
    'A circle has a circumference of 18π. What is the area of the circle?',
    '[{"id":"A","text":"9π"},{"id":"B","text":"18π"},{"id":"C","text":"81π"},{"id":"D","text":"162π"}]',
    'C', 'Circumference = 2πr = 18π, so r = 9. Area = πr^2 = 81π.'),

  ('math', 'Algebra', 'Systems', 'hard', 'student_produced_response',
    null,
    'A company sells two types of tickets: standard tickets for $15 and VIP tickets for $40. On a night when 200 tickets were sold for a total of $4,250, how many VIP tickets were sold?',
    null,
    '50', 'Let s + v = 200 and 15s + 40v = 4250. Substituting s = 200 - v gives 25v = 1250, so v = 50.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'hard', 'multiple_choice',
    null,
    'In a survey of 300 students, 180 said they prefer online classes. If the survey''s margin of error is plus or minus 4 percentage points, which of the following is closest to the range of the true percentage of all students who prefer online classes?',
    '[{"id":"A","text":"56% to 64%"},{"id":"B","text":"50% to 70%"},{"id":"C","text":"40% to 80%"},{"id":"D","text":"60% to 60%"}]',
    'A', '180/300 = 60%. Applying the +/- 4 point margin of error gives a range of 56% to 64%.'),

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

  ('math', 'Algebra', 'Linear equations', 'easy', 'multiple_choice',
    null,
    'If 5x - 3 = 27, what is the value of x?',
    '[{"id":"A","text":"4"},{"id":"B","text":"5"},{"id":"C","text":"6"},{"id":"D","text":"7"}]',
    'C', '5x - 3 = 27 -> 5x = 30 -> x = 6.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'easy', 'multiple_choice',
    null,
    'A jacket costs $80 after a 20% discount is applied to its original price. What was the original price?',
    '[{"id":"A","text":"$96"},{"id":"B","text":"$100"},{"id":"C","text":"$64"},{"id":"D","text":"$88"}]',
    'B', 'If the original price is p, then 0.8p = 80, so p = 100.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null,
    'In a classroom, the ratio of boys to girls is 3 to 4. If there are 12 boys, how many girls are there?',
    null,
    '16', 'Set up the proportion 3/4 = 12/x. Solving gives x = 16.'),

  ('math', 'Advanced Math', 'Exponents', 'easy', 'multiple_choice',
    null,
    'What is the value of (3^4)/(3^2)?',
    '[{"id":"A","text":"3"},{"id":"B","text":"6"},{"id":"C","text":"9"},{"id":"D","text":"27"}]',
    'C', 'Subtracting exponents with the same base: 3^4 / 3^2 = 3^2 = 9.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'easy', 'multiple_choice',
    null,
    'In a triangle, two angles measure 50 degrees and 65 degrees. What is the measure of the third angle?',
    '[{"id":"A","text":"55"},{"id":"B","text":"65"},{"id":"C","text":"75"},{"id":"D","text":"115"}]',
    'B', 'A triangle''s angles sum to 180 degrees: 180 - 50 - 65 = 65.'),

  ('math', 'Algebra', 'Linear equations', 'easy', 'student_produced_response',
    null,
    'A phone plan charges a flat fee of $20 plus $0.10 per text message. If Maria''s bill was $35, how many text messages did she send?',
    null,
    '150', '20 + 0.10x = 35 -> 0.10x = 15 -> x = 150.'),

  ('math', 'Algebra', 'Systems', 'medium', 'multiple_choice',
    null,
    'If 2x + y = 11 and x - y = 1, what is the value of y?',
    '[{"id":"A","text":"1"},{"id":"B","text":"2"},{"id":"C","text":"3"},{"id":"D","text":"4"}]',
    'C', 'From x - y = 1, x = y + 1. Substituting: 2(y+1) + y = 11 -> 3y + 2 = 11 -> y = 3.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'student_produced_response',
    null,
    'If g(x) = 3x - 4, what is the value of x for which g(x) = 11?',
    null,
    '5', '3x - 4 = 11 -> 3x = 15 -> x = 5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'medium', 'multiple_choice',
    null,
    'A data set of six numbers has a mean of 15. If five of the numbers are 10, 12, 14, 18, and 20, what is the sixth number?',
    '[{"id":"A","text":"14"},{"id":"B","text":"15"},{"id":"C","text":"16"},{"id":"D","text":"18"}]',
    'C', 'The six numbers sum to 90. The five given numbers sum to 74, so the sixth is 90 - 74 = 16.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'medium', 'multiple_choice',
    null,
    'A circle has a radius of 5. What is its circumference, in terms of π?',
    '[{"id":"A","text":"5π"},{"id":"B","text":"10π"},{"id":"C","text":"25π"},{"id":"D","text":"15π"}]',
    'B', 'Circumference = 2πr = 2π(5) = 10π.'),

  ('math', 'Advanced Math', 'Exponents', 'medium', 'multiple_choice',
    null,
    'A population of bacteria doubles every hour. If there are 100 bacteria at time zero, how many bacteria will there be after 3 hours?',
    '[{"id":"A","text":"300"},{"id":"B","text":"400"},{"id":"C","text":"600"},{"id":"D","text":"800"}]',
    'D', '100 * 2^3 = 100 * 8 = 800.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'medium', 'multiple_choice',
    null,
    'A store increases the price of an item by 25%, then later decreases the new price by 20%. What is the overall percent change from the original price?',
    '[{"id":"A","text":"-5%"},{"id":"B","text":"0%"},{"id":"C","text":"+5%"},{"id":"D","text":"+20%"}]',
    'B', 'Starting at 100: after +25% it is 125; after -20% it is 125 * 0.8 = 100, which is the original price -- a 0% overall change.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'medium', 'multiple_choice',
    null,
    'A ladder 13 feet long leans against a wall, with its base 5 feet from the wall. How many feet up the wall does the ladder reach?',
    '[{"id":"A","text":"8"},{"id":"B","text":"10"},{"id":"C","text":"12"},{"id":"D","text":"13"}]',
    'C', 'By the Pythagorean theorem: sqrt(13^2 - 5^2) = sqrt(169 - 25) = sqrt(144) = 12.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'multiple_choice',
    null,
    'A ball''s height in feet is modeled by h(t) = -16t^2 + 64t, where t is time in seconds after launch. At what time does the ball reach its maximum height?',
    '[{"id":"A","text":"1"},{"id":"B","text":"2"},{"id":"C","text":"3"},{"id":"D","text":"4"}]',
    'B', 'The vertex of h(t) = -16t^2 + 64t occurs at t = -b/(2a) = -64/(2*-16) = 2.'),

  ('math', 'Algebra', 'Systems', 'hard', 'student_produced_response',
    null,
    'A theater sells adult tickets for $12 and child tickets for $7. One evening, 150 tickets were sold for a total of $1,400. How many adult tickets were sold?',
    null,
    '70', 'Let a + c = 150 and 12a + 7c = 1400. Substituting c = 150 - a gives 5a = 350, so a = 70.'),

  ('math', 'Geometry and Trigonometry', 'Triangles', 'hard', 'multiple_choice',
    null,
    'In a right triangle, one angle measures 30 degrees and the side opposite that angle has length 6. What is the length of the hypotenuse?',
    '[{"id":"A","text":"6"},{"id":"B","text":"9"},{"id":"C","text":"12"},{"id":"D","text":"6√3"}]',
    'C', 'sin(30 degrees) = 0.5 = opposite/hypotenuse = 6/hypotenuse, so hypotenuse = 6/0.5 = 12.'),

  ('math', 'Problem-Solving and Data Analysis', 'Statistics', 'hard', 'multiple_choice',
    null,
    'A bag contains 4 red marbles, 5 blue marbles, and 3 green marbles. If one marble is drawn at random, what is the probability that it is NOT blue?',
    '[{"id":"A","text":"5/12"},{"id":"B","text":"7/12"},{"id":"C","text":"1/3"},{"id":"D","text":"3/4"}]',
    'B', 'There are 12 marbles total and 5 are blue, so 7 are not blue: probability = 7/12.'),

  ('math', 'Advanced Math', 'Quadratics', 'hard', 'student_produced_response',
    null,
    'The product of two consecutive positive integers is 132. What is the smaller integer?',
    null,
    '11', 'n(n+1) = 132 -> n^2 + n - 132 = 0 -> (n-11)(n+12) = 0, so n = 11 (the positive solution).'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'hard', 'multiple_choice',
    null,
    'A circle has an area of 64π. A central angle of 90 degrees cuts out a sector of the circle. What is the area of that sector?',
    '[{"id":"A","text":"8π"},{"id":"B","text":"16π"},{"id":"C","text":"32π"},{"id":"D","text":"64π"}]',
    'B', 'The radius satisfies r^2 = 64, so the sector area is (90/360) * 64π = 16π.'),

  ('math', 'Algebra', 'Linear equations', 'hard', 'student_produced_response',
    null,
    'A rectangle''s length is 3 more than twice its width. If the perimeter of the rectangle is 36, what is the width?',
    null,
    '5', 'Let w be the width; length = 2w + 3. Perimeter: 2(w + 2w + 3) = 6w + 6 = 36, so w = 5.'),

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

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'medium', 'student_produced_response',
    null,
    'A map has a scale where 2 inches represents 15 miles. If two cities are 7 inches apart on the map, how many miles apart are they in reality?',
    null,
    '52.5', 'Set up the proportion 2/15 = 7/x. Solving gives x = 15 * 7 / 2 = 52.5.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'hard', 'multiple_choice',
    null,
    'A paint mixture uses blue and yellow paint in a ratio of 5 to 3 to make green paint. If a painter wants to make 40 liters of this green paint, how many liters of blue paint are needed?',
    '[{"id":"A","text":"15"},{"id":"B","text":"20"},{"id":"C","text":"25"},{"id":"D","text":"30"}]',
    'C', 'The ratio has 8 total parts, and blue is 5 of them: (5/8) * 40 = 25 liters.'),

  ('math', 'Advanced Math', 'Functions', 'easy', 'student_produced_response',
    null,
    'If h(x) = x + 6, what is the value of h(4)?',
    null,
    '10', 'h(4) = 4 + 6 = 10.'),

  ('math', 'Advanced Math', 'Functions', 'hard', 'multiple_choice',
    null,
    'If p(x) = 2x^2 + 3x - 5, what is the value of p(-2)?',
    '[{"id":"A","text":"-3"},{"id":"B","text":"3"},{"id":"C","text":"9"},{"id":"D","text":"15"}]',
    'A', 'p(-2) = 2(4) + 3(-2) - 5 = 8 - 6 - 5 = -3.'),

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

  ('math', 'Algebra', 'Linear equations', 'medium', 'student_produced_response',
    null,
    'If 4(x - 3) = 2x + 6, what is the value of x?',
    null,
    '9', '4x - 12 = 2x + 6 -> 2x = 18 -> x = 9.'),

  ('math', 'Problem-Solving and Data Analysis', 'Percentages', 'hard', 'multiple_choice',
    null,
    'A store''s revenue increased from $80,000 to $92,000 over one year. What was the percent increase in revenue?',
    '[{"id":"A","text":"12%"},{"id":"B","text":"15%"},{"id":"C","text":"18%"},{"id":"D","text":"20%"}]',
    'B', '(92,000 - 80,000) / 80,000 = 12,000 / 80,000 = 0.15 = 15%.'),

  ('math', 'Problem-Solving and Data Analysis', 'Ratios', 'easy', 'student_produced_response',
    null,
    'A fruit punch recipe uses juice and soda in a ratio of 5 to 2. If a batch uses 10 cups of juice, how many cups of soda are needed?',
    null,
    '4', 'Set up the proportion 5/2 = 10/x. Solving gives x = 4.'),

  ('math', 'Advanced Math', 'Exponents', 'medium', 'multiple_choice',
    null,
    'What is the value of (2^5)^2?',
    '[{"id":"A","text":"64"},{"id":"B","text":"128"},{"id":"C","text":"512"},{"id":"D","text":"1024"}]',
    'D', 'Multiplying exponents: (2^5)^2 = 2^10 = 1024.'),

  ('math', 'Algebra', 'Systems', 'easy', 'student_produced_response',
    null,
    'If y = 3x and x + y = 16, what is the value of x?',
    null,
    '4', 'Substituting: x + 3x = 16 -> 4x = 16 -> x = 4.'),

  ('math', 'Advanced Math', 'Functions', 'medium', 'student_produced_response',
    null,
    'If f(x) = x^2 - 4x, for what positive value of x does f(x) = 0?',
    null,
    '4', 'x^2 - 4x = 0 -> x(x - 4) = 0, so x = 0 or x = 4. The positive value is 4.'),

  ('math', 'Advanced Math', 'Quadratics', 'medium', 'multiple_choice',
    null,
    'What are the solutions to x^2 - 9 = 0?',
    '[{"id":"A","text":"x = 3 only"},{"id":"B","text":"x = -3 only"},{"id":"C","text":"x = 3, -3"},{"id":"D","text":"x = 9, -9"}]',
    'C', 'x^2 = 9, so x = 3 or x = -3.'),

  ('math', 'Geometry and Trigonometry', 'Circles', 'medium', 'multiple_choice',
    null,
    'A circle has a diameter of 14. What is its area, in terms of π?',
    '[{"id":"A","text":"7π"},{"id":"B","text":"14π"},{"id":"C","text":"49π"},{"id":"D","text":"98π"}]',
    'C', 'The radius is half the diameter, 7. Area = πr^2 = 49π.')
) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'digital-sat'
on conflict (exam_id, md5(coalesce(stimulus, '') || E'\x1f' || question_text)) do nothing;

-- ============================================================
-- Explanations that stopped at the arithmetic
-- ============================================================

-- Nine of the seeded Math explanations were a line of working and nothing
-- else: "3x + 7 = 22 -> 3x = 15 -> x = 5." That is a correct answer and a
-- useless explanation. The student reading it got the question wrong, and
-- the one thing they need is the step they missed -- which the working
-- shows without ever naming. Rewritten to name the move.
--
-- Updated by question text rather than reinserted, so databases that already
-- hold these rows get the better explanation too.

update public.diagnostic_questions q
set explanation = v.explanation
from (values
  ('If 3x + 7 = 22, what is the value of x?',
   'Undo the operations in reverse order: subtract 7 from both sides to get 3x = 15, then divide both sides by 3 to get x = 5. The commonest slip is dividing before subtracting, which gives x + 7/3 = 22/3 and leads nowhere useful.'),
  ('If f(x) = 2x^2 - 3, what is f(3)?',
   'Substitute 3 for every x, then follow the order of operations: square first, so 3^2 = 9; multiply, so 2(9) = 18; subtract last, giving 15. Multiplying before squaring gives (2*3)^2 - 3 = 33, which is the usual wrong answer here.'),
  ('If 5x - 3 = 27, what is the value of x?',
   'Add 3 to both sides to isolate the term with x, giving 5x = 30, then divide by 5 to get x = 6. Note that the 3 is subtracted, so it moves across the equals sign by addition rather than subtraction.'),
  ('If g(x) = 3x - 4, what is the value of x for which g(x) = 11?',
   'This asks for the input, not the output, so set the rule equal to 11 rather than substituting 11 for x: 3x - 4 = 11, so 3x = 15 and x = 5. Substituting 11 for x instead gives g(11) = 29, which answers a different question.'),
  ('A circle has a radius of 5. What is its circumference, in terms of π?',
   'Circumference is 2πr, so 2π(5) = 10π. The area formula πr^2 would give 25π, which is the commonest wrong answer -- the two formulas are worth separating by what they measure: circumference is a length, area is a length squared.'),
  ('A population of bacteria doubles every hour. If there are 100 bacteria at time zero, how many bacteria will there be after 3 hours?',
   'Doubling is repeated multiplication, not addition, so after t hours the population is 100 * 2^t. After 3 hours that is 100 * 8 = 800. Adding 100 each hour instead gives 400, which is the trap this question is set to catch.'),
  ('If h(x) = x + 6, what is the value of h(4)?',
   'Function notation means substitute: replace x with 4, giving 4 + 6 = 10. h(4) does not mean h times 4, which is the misreading that makes this question worth asking at all.'),
  ('If 4(x - 3) = 2x + 6, what is the value of x?',
   'Distribute the 4 across both terms in the bracket first: 4x - 12 = 2x + 6. Subtract 2x from both sides to get 2x - 12 = 6, add 12 to get 2x = 18, and divide to get x = 9. Distributing to only the x, giving 4x - 3, is the usual error.'),
  ('What are the solutions to x^2 - 9 = 0?',
   'Add 9 to both sides to get x^2 = 9, then take the square root of both sides -- and remember that a square root equation has two solutions, so x = 3 or x = -3. Reporting only the positive root is the point of the question. Factoring as (x - 3)(x + 3) = 0 gives the same pair.')
) as v(question_text, explanation)
where q.question_text = v.question_text;
