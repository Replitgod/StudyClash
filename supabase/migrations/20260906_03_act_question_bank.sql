-- An original ACT-style question bank.
--
-- Every item below was written for this migration. None of it reproduces,
-- paraphrases, or is derived from a real ACT item -- those are copyrighted
-- and secure, and shipping them would put AceDecks and every school that
-- buys Classroom at risk. What IS copied is the published specification:
-- the four sections, their domains, the question formats and the pacing.
-- A specification is public; a question bank is not.
--
-- Written to the enhanced ACT: English 50/35, Math 45/50, Reading 36/40,
-- and the optional Science 40/40. Domain names are ACT's own reporting
-- categories, so a student who sees "Production of Writing" here sees the
-- same words on a real score report.
--
-- Where a Reading or Science question needs a passage, the passage is
-- stored on the question rather than in a table of its own. That looks like
-- duplication and is deliberate: the bank picker selects items
-- independently, so two questions from one passage will usually not appear
-- together, and an item that cannot be answered without a sibling it may
-- never be shown alongside is a broken item.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index
-- created in 20260906_01. That ordering is not incidental: nearly every
-- Conventions of Standard English item here shares the stem "Which choice
-- makes the sentence conform to the conventions of Standard English?", and
-- under the old stem-only index ten of these sixty rows would have been
-- silently discarded on insert -- the same bug that cost the SAT bank a
-- third of its questions.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  -- ========================= English =========================
  -- Conventions of Standard English

  ('english', 'Conventions of Standard English', 'Punctuation', 'easy', 'multiple_choice',
    'The observatory, which sits at the highest point in the county ______ attracts astronomers from three neighboring states.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"county, attracts"},{"id":"B","text":"county; attracts"},{"id":"C","text":"county: attracts"},{"id":"D","text":"county attracts"}]',
    'A', 'The clause "which sits at the highest point in the county" is nonessential and already opens with a comma, so it must close with one. A semicolon or colon would need an independent clause after it, and omitting the punctuation leaves the interrupting clause unclosed.'),

  ('english', 'Conventions of Standard English', 'Subject-verb agreement', 'easy', 'multiple_choice',
    'The collection of fossils donated by the retired geologist ______ now the centerpiece of the museum''s new wing.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"are"},{"id":"B","text":"is"},{"id":"C","text":"were"},{"id":"D","text":"have been"}]',
    'B', 'The subject is "collection", which is singular; "of fossils" is a prepositional phrase and cannot govern the verb. Every plural option agrees with "fossils" rather than with the actual subject.'),

  ('english', 'Conventions of Standard English', 'Pronoun agreement', 'easy', 'multiple_choice',
    'Neither of the two candidates had finished ______ closing statement when the moderator called time.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"their"},{"id":"B","text":"his or her"},{"id":"C","text":"its"},{"id":"D","text":"they''re"}]',
    'B', '"Neither" is singular, so it takes a singular pronoun, and the candidates are people rather than things. "Their" is plural, "its" is for things, and "they''re" is a contraction of "they are".'),

  ('english', 'Conventions of Standard English', 'Sentence boundaries', 'medium', 'multiple_choice',
    'The storm knocked out power for six days ______ the bakery on Third Street never closed once.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"days, the bakery"},{"id":"B","text":"days, but the bakery"},{"id":"C","text":"days the bakery"},{"id":"D","text":"days, and however the bakery"}]',
    'B', 'Two independent clauses joined by a comma alone is a comma splice, and joined by nothing is a run-on. A comma plus the coordinating conjunction "but" joins them correctly and matches the contrast between the two facts.'),

  ('english', 'Conventions of Standard English', 'Modifiers', 'medium', 'multiple_choice',
    'Rusted through and missing two rungs, ______',
    'Which choice completes the sentence so that the modifier is not dangling?',
    '[{"id":"A","text":"the inspector condemned the fire escape."},{"id":"B","text":"the fire escape was condemned by the inspector."},{"id":"C","text":"condemning the fire escape was necessary."},{"id":"D","text":"it was necessary to condemn the fire escape."}]',
    'B', 'The opening phrase describes the fire escape, so the fire escape must be the subject that follows. In A the inspector is rusted through; in C and D the subject is an abstraction, which the phrase cannot describe.'),

  ('english', 'Conventions of Standard English', 'Verb tense', 'medium', 'multiple_choice',
    'By the time the archivists opened the crate, the letters inside ______ untouched for nearly a century.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"sit"},{"id":"B","text":"have sat"},{"id":"C","text":"had sat"},{"id":"D","text":"will have sat"}]',
    'C', 'The letters sat before the archivists opened the crate, and both events are in the past, so the earlier one takes the past perfect. The present perfect in B would connect the sitting to now rather than to the opening.'),

  ('english', 'Conventions of Standard English', 'Punctuation', 'hard', 'multiple_choice',
    'The recipe calls for three ingredients the cook did not have ______ saffron, buttermilk, and a preserved lemon.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"have, saffron"},{"id":"B","text":"have: saffron"},{"id":"C","text":"have; saffron"},{"id":"D","text":"have saffron"}]',
    'B', 'A colon introduces a list that specifies what the preceding independent clause referred to. A semicolon requires an independent clause after it, and a bare comma before a three-item list of this kind leaves the list unintroduced.'),

  ('english', 'Conventions of Standard English', 'Parallel structure', 'hard', 'multiple_choice',
    'The apprenticeship required her to draft blueprints, to survey the site, and ______',
    'Which choice completes the sentence with parallel structure?',
    '[{"id":"A","text":"supervising the pour."},{"id":"B","text":"she supervised the pour."},{"id":"C","text":"to supervise the pour."},{"id":"D","text":"the supervision of the pour."}]',
    'C', 'The first two items are infinitive phrases, so the third must be one as well. A gerund, a clause and a noun phrase each break the series.'),

  -- Production of Writing

  ('english', 'Production of Writing', 'Transitions', 'easy', 'multiple_choice',
    'The new filtration system removes almost every contaminant the old one missed. ______ it uses roughly a third less electricity to do it.',
    'Which transition best fits the relationship between the two sentences?',
    '[{"id":"A","text":"Nevertheless,"},{"id":"B","text":"Better still,"},{"id":"C","text":"By contrast,"},{"id":"D","text":"For instance,"}]',
    'B', 'The second sentence adds a further advantage, so an additive transition fits. "Nevertheless" and "By contrast" signal opposition, and "For instance" signals an example, which the electricity figure is not.'),

  ('english', 'Production of Writing', 'Adding and deleting', 'medium', 'multiple_choice',
    'A paragraph about the decline of urban bee populations ends: "Beekeepers in the city reported losing 38 percent of their hives last winter, the worst rate on record." The writer is considering adding the sentence: "Honey has been produced in the region since at least the 1840s."',
    'Should the writer make this addition?',
    '[{"id":"A","text":"Yes, because it establishes the historical importance of local beekeeping."},{"id":"B","text":"Yes, because it explains why hive losses were unusually high."},{"id":"C","text":"No, because it introduces a detail unrelated to the paragraph''s focus on recent losses."},{"id":"D","text":"No, because it contradicts the statistic given in the previous sentence."}]',
    'C', 'The paragraph is about a recent, measured decline. The date honey production began is unrelated to that, so the sentence is a digression. It does not explain the losses and it contradicts nothing.'),

  ('english', 'Production of Writing', 'Organization', 'medium', 'multiple_choice',
    'A writer is arranging four sentences: (1) The results surprised even the researchers who designed the trial. (2) Volunteers walked for twenty minutes after each meal. (3) A recent study tested a very simple intervention. (4) Average post-meal blood sugar fell by nearly a fifth.',
    'Which order produces the most logical paragraph?',
    '[{"id":"A","text":"3, 2, 4, 1"},{"id":"B","text":"1, 3, 2, 4"},{"id":"C","text":"2, 3, 1, 4"},{"id":"D","text":"4, 1, 2, 3"}]',
    'A', 'The paragraph must introduce the study, describe what was done, report the result, then comment on it. Sentence 1 comments on results and so cannot come before them, which eliminates B and D; sentence 2 cannot open, since "Volunteers" has no antecedent yet.'),

  ('english', 'Production of Writing', 'Purpose', 'hard', 'multiple_choice',
    'A writer wants to end an essay about restoring a salt marsh by emphasizing that the work is not finished.',
    'Which choice best accomplishes that goal?',
    '[{"id":"A","text":"The marsh today is a remarkable sight, and the volunteers deserve every bit of the credit."},{"id":"B","text":"Three of the seven original channels now flow freely; the other four are still choked with fill."},{"id":"C","text":"Restoration projects like this one have been attempted in nine states."},{"id":"D","text":"The first shovel went into the ground on a cold morning in March."}]',
    'B', 'Only B names what remains undone, and does so with a specific figure. A closes on praise, C widens to other states, and D returns to the beginning of the project.'),

  -- Knowledge of Language

  ('english', 'Knowledge of Language', 'Word choice', 'easy', 'multiple_choice',
    'The committee''s report was so ______ that even the members who had written it struggled to summarize its recommendations.',
    'Which word best fits the context?',
    '[{"id":"A","text":"convoluted"},{"id":"B","text":"concise"},{"id":"C","text":"illuminating"},{"id":"D","text":"abbreviated"}]',
    'A', 'If the authors themselves could not summarize it, the report was tangled. "Concise" and "abbreviated" mean short, and "illuminating" means clarifying -- each the opposite of what the sentence describes.'),

  ('english', 'Knowledge of Language', 'Concision', 'medium', 'multiple_choice',
    'The reason the flight was delayed was because of the fact that a mechanical inspection ran long.',
    'Which revision is most concise while keeping the meaning?',
    '[{"id":"A","text":"The reason the flight was delayed was due to the fact that a mechanical inspection ran long."},{"id":"B","text":"The flight was delayed because a mechanical inspection ran long."},{"id":"C","text":"The reason for the flight delay was on account of a long mechanical inspection."},{"id":"D","text":"The flight, delayed, was because of a mechanical inspection running long."}]',
    'B', '"The reason ... was because" is redundant, and "the fact that" adds nothing. B states the cause once. C keeps the redundancy in different words, and D is ungrammatical.'),

  ('english', 'Knowledge of Language', 'Style and tone', 'medium', 'multiple_choice',
    'In a formal lab report: "The temperature readings from the second trial were ______ compared with the first."',
    'Which choice best maintains the tone of the report?',
    '[{"id":"A","text":"way off"},{"id":"B","text":"substantially lower"},{"id":"C","text":"kind of low"},{"id":"D","text":"a total mess"}]',
    'B', 'A lab report calls for precise, neutral language. The other three are conversational, and two of them are vague about direction as well as degree.'),

  ('english', 'Knowledge of Language', 'Word choice', 'hard', 'multiple_choice',
    'Although the treaty was signed with great ceremony, its provisions were ______ from the first week, and by spring neither side was pretending otherwise.',
    'Which word best fits the context?',
    '[{"id":"A","text":"flouted"},{"id":"B","text":"flaunted"},{"id":"C","text":"fostered"},{"id":"D","text":"formalized"}]',
    'A', 'To flout is to disregard openly, which is what the second clause describes. "Flaunt" means to display showily and is the classic confusion here; "fostered" and "formalized" both mean the treaty was being upheld.'),

  ('english', 'Conventions of Standard English', 'Apostrophes', 'medium', 'multiple_choice',
    'Both of the ______ engines were rebuilt over the winter, and the fleet returned to service in April.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"ferries''"},{"id":"B","text":"ferry''s"},{"id":"C","text":"ferries"},{"id":"D","text":"ferrys''"}]',
    'A', '"Both" establishes more than one ferry, and the engines belong to them, so this is a plural possessive: ferries becomes ferries with an apostrophe after the s. B is singular possessive, C is a plain plural, and "ferrys" is not a spelling of the plural.'),

  ('english', 'Production of Writing', 'Transitions', 'hard', 'multiple_choice',
    'Wind turbines kill an estimated hundreds of thousands of birds each year in the United States. ______ buildings and domestic cats are each responsible for losses two to three orders of magnitude larger.',
    'Which transition best fits the relationship between the two sentences?',
    '[{"id":"A","text":"Consequently,"},{"id":"B","text":"For perspective,"},{"id":"C","text":"Similarly,"},{"id":"D","text":"In other words,"}]',
    'B', 'The second sentence supplies a comparison that reframes the size of the first figure. It is not a consequence, not a restatement, and not a parallel case -- the whole point is the difference in scale.'),

  ('english', 'Conventions of Standard English', 'Punctuation', 'easy', 'multiple_choice',
    'The mechanic explained that the noise was harmless ______ a loose heat shield rattling against the exhaust.',
    'Which choice makes the sentence conform to the conventions of Standard English?',
    '[{"id":"A","text":"harmless, a loose"},{"id":"B","text":"harmless. A loose"},{"id":"C","text":"harmless; a loose"},{"id":"D","text":"harmless and a loose"}]',
    'A', 'The phrase after the blank renames "the noise" and is not an independent clause, so a comma is correct. A period or semicolon would leave a fragment standing alone, and "and" would suggest a second, separate thing.'),

  ('english', 'Knowledge of Language', 'Concision', 'easy', 'multiple_choice',
    'At this point in time, the museum is currently closed for renovations.',
    'Which revision is most concise while keeping the meaning?',
    '[{"id":"A","text":"At this point in time, the museum is closed for renovations."},{"id":"B","text":"The museum is currently closed for renovations at this time."},{"id":"C","text":"The museum is closed for renovations."},{"id":"D","text":"Currently, at this point, the museum is closed for renovations."}]',
    'C', '"At this point in time" and "currently" say the same thing, and the present tense already says it a third time. Only C removes all of the redundancy.'),

  -- ========================= Math =========================

  ('math', 'Integrating Essential Skills', 'Percentages', 'easy', 'multiple_choice',
    null,
    'A jacket is marked down from $80 to $68. By what percent was the price reduced?',
    '[{"id":"A","text":"12%"},{"id":"B","text":"15%"},{"id":"C","text":"17.6%"},{"id":"D","text":"20%"}]',
    'B', 'The reduction is $12, and 12/80 = 0.15, so 15 percent. Choice A is the dollar amount mistaken for a percent, and C divides by the new price instead of the original.'),

  ('math', 'Preparing for Higher Math', 'Linear equations', 'easy', 'multiple_choice',
    null,
    'If 5x - 3 = 2x + 12, what is the value of x?',
    '[{"id":"A","text":"3"},{"id":"B","text":"5"},{"id":"C","text":"7"},{"id":"D","text":"9"}]',
    'B', 'Subtracting 2x from both sides gives 3x - 3 = 12, so 3x = 15 and x = 5.'),

  ('math', 'Integrating Essential Skills', 'Rates', 'easy', 'multiple_choice',
    null,
    'A printer produces 14 pages per minute. How many minutes does it take to print 385 pages?',
    '[{"id":"A","text":"22.5"},{"id":"B","text":"25"},{"id":"C","text":"27.5"},{"id":"D","text":"32"}]',
    'C', 'Time equals total pages divided by the rate: 385 / 14 = 27.5 minutes. Multiplying instead of dividing gives a number in the thousands, and the units are the check -- pages divided by pages-per-minute leaves minutes.'),

  ('math', 'Preparing for Higher Math', 'Geometry', 'easy', 'multiple_choice',
    null,
    'A right triangle has legs of length 9 and 12. What is the length of its hypotenuse?',
    '[{"id":"A","text":"13"},{"id":"B","text":"15"},{"id":"C","text":"21"},{"id":"D","text":"25"}]',
    'B', '81 + 144 = 225, and the square root of 225 is 15. Choice C adds the legs instead of using the Pythagorean theorem.'),

  ('math', 'Preparing for Higher Math', 'Quadratics', 'medium', 'multiple_choice',
    null,
    'What are the solutions to x^2 - 5x - 14 = 0?',
    '[{"id":"A","text":"x = -2 and x = 7"},{"id":"B","text":"x = 2 and x = -7"},{"id":"C","text":"x = -1 and x = 14"},{"id":"D","text":"x = 1 and x = -14"}]',
    'A', 'The expression factors as (x - 7)(x + 2), so x = 7 or x = -2. Choice B has the signs of both roots reversed, which multiplies to -14 but sums to -5 rather than +5.'),

  ('math', 'Preparing for Higher Math', 'Functions', 'medium', 'multiple_choice',
    null,
    'If f(x) = 3x^2 - 2x + 1, what is f(-2)?',
    '[{"id":"A","text":"9"},{"id":"B","text":"11"},{"id":"C","text":"17"},{"id":"D","text":"-15"}]',
    'C', '3(-2)^2 = 12, then -2(-2) = +4, plus 1 gives 17. Choice D comes from squaring after multiplying, treating 3(-2)^2 as (3 times -2)^2 with the wrong sign handling.'),

  ('math', 'Preparing for Higher Math', 'Statistics and probability', 'medium', 'multiple_choice',
    null,
    'A bag holds 4 red, 6 blue, and 5 green marbles. One marble is drawn and not replaced, and it is blue. What is the probability the next marble drawn is also blue?',
    '[{"id":"A","text":"6/15"},{"id":"B","text":"5/14"},{"id":"C","text":"6/14"},{"id":"D","text":"5/15"}]',
    'B', 'After one blue is removed there are 5 blue marbles among 14 remaining. Choice C forgets to reduce the blue count, and A ignores the removal entirely.'),

  ('math', 'Modeling', 'Linear models', 'medium', 'multiple_choice',
    null,
    'A gym charges a $45 joining fee plus $28 per month. Which equation gives the total cost C in dollars after m months?',
    '[{"id":"A","text":"C = 45m + 28"},{"id":"B","text":"C = 28m + 45"},{"id":"C","text":"C = 73m"},{"id":"D","text":"C = 45 + 28 + m"}]',
    'B', 'The monthly charge is the rate and so multiplies m; the joining fee is paid once and is the constant. Choice A reverses the two, and C charges the joining fee every month.'),

  ('math', 'Preparing for Higher Math', 'Trigonometry', 'medium', 'multiple_choice',
    null,
    'In a right triangle, the angle A satisfies sin A = 3/5. What is cos A, given that A is acute?',
    '[{"id":"A","text":"3/4"},{"id":"B","text":"4/5"},{"id":"C","text":"5/4"},{"id":"D","text":"4/3"}]',
    'B', 'With opposite 3 and hypotenuse 5, the adjacent leg is 4 by the Pythagorean theorem, so cos A = 4/5. Choice A is tan A and D is its reciprocal.'),

  ('math', 'Integrating Essential Skills', 'Proportions', 'medium', 'multiple_choice',
    null,
    'A map uses a scale of 1 inch to 24 miles. Two towns are 3.5 inches apart on the map. How many miles apart are they?',
    '[{"id":"A","text":"68"},{"id":"B","text":"72"},{"id":"C","text":"84"},{"id":"D","text":"96"}]',
    'C', '3.5 times 24 is 84 miles. Choice B multiplies by 3 and D by 4.'),

  ('math', 'Preparing for Higher Math', 'Number and quantity', 'hard', 'multiple_choice',
    null,
    'If i is the imaginary unit, what is (3 + 2i)(1 - 4i)?',
    '[{"id":"A","text":"11 - 10i"},{"id":"B","text":"-5 - 10i"},{"id":"C","text":"3 - 8i"},{"id":"D","text":"11 + 14i"}]',
    'A', 'Expanding gives 3 - 12i + 2i - 8i^2. Since i^2 = -1, the last term is +8, so the result is 11 - 10i. Choice B treats i^2 as +1.'),

  ('math', 'Preparing for Higher Math', 'Geometry', 'hard', 'multiple_choice',
    null,
    'A circle has the equation x^2 + y^2 - 6x + 8y = 0. What is its radius?',
    '[{"id":"A","text":"5"},{"id":"B","text":"7"},{"id":"C","text":"10"},{"id":"D","text":"25"}]',
    'A', 'Completing the square gives (x - 3)^2 + (y + 4)^2 = 9 + 16 = 25, so the radius is the square root of 25, which is 5. Choice D reports the square of the radius.'),

  ('math', 'Modeling', 'Exponential models', 'hard', 'multiple_choice',
    null,
    'A culture of 500 bacteria doubles every 3 hours. Which expression gives the population after t hours?',
    '[{"id":"A","text":"500 * 2^(3t)"},{"id":"B","text":"500 * 2^(t/3)"},{"id":"C","text":"500 * 3^(t/2)"},{"id":"D","text":"500 + 2^(t/3)"}]',
    'B', 'One doubling happens per 3 hours, so the exponent counts doublings: t/3. Choice A doubles three times an hour, and C swaps the base with the interval.'),

  ('math', 'Preparing for Higher Math', 'Systems', 'hard', 'student_produced_response',
    null,
    'The system 2x + 3y = 31 and x - y = 3 has exactly one solution. What is the value of y?',
    null, '5', 'From the second equation x = y + 3. Substituting gives 2(y + 3) + 3y = 31, so 5y + 6 = 31, 5y = 25, and y = 5.'),

  ('math', 'Integrating Essential Skills', 'Averages', 'hard', 'student_produced_response',
    null,
    'A student has scores of 82, 91, and 78 on three tests. What score on a fourth test would make the average of all four exactly 85?',
    null, '89', 'A mean of 85 across four tests requires a total of 340. The first three total 251, so the fourth must be 89.'),

  ('math', 'Preparing for Higher Math', 'Functions', 'hard', 'multiple_choice',
    null,
    'The function g is defined by g(x) = 2(x - 4)^2 + 7. What is the minimum value of g?',
    '[{"id":"A","text":"-4"},{"id":"B","text":"4"},{"id":"C","text":"7"},{"id":"D","text":"15"}]',
    'C', 'A squared term is never negative, so the smallest value of 2(x - 4)^2 is 0, reached at x = 4, leaving g = 7. Choice B reports the x value at which the minimum occurs rather than the minimum itself.'),

  -- ========================= Reading =========================

  ('reading', 'Key Ideas and Details', 'Main idea', 'easy', 'multiple_choice',
    'For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.',
    'The passage is primarily concerned with:',
    '[{"id":"A","text":"the varieties of plants best suited to a difficult climate"},{"id":"B","text":"the narrator''s grandmother''s methodical documentation of her gardening, including its failures"},{"id":"C","text":"the narrator''s regret at never having learned to garden"},{"id":"D","text":"the practical advantages of keeping written records in any hobby"}]',
    'B', 'The passage describes the ledger, its columns, and the narrator''s reaction to the record of failure. It names no plant varieties, expresses no regret about the narrator''s own gardening, and generalizes to no other hobby.'),

  ('reading', 'Craft and Structure', 'Word meaning in context', 'medium', 'multiple_choice',
    'For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.',
    'As it is used in the passage, the word "patiently" most nearly means:',
    '[{"id":"A","text":"calmly, without irritation"},{"id":"B","text":"slowly, at an unhurried pace"},{"id":"C","text":"persistently, without giving up the record"},{"id":"D","text":"quietly, without telling anyone"}]',
    'C', 'The narrator is struck by thirty years of recording losses, so the word carries the sense of persistence over time. The passage says nothing about her mood, her speed, or her secrecy.'),

  ('reading', 'Integration of Knowledge and Ideas', 'Inference', 'medium', 'multiple_choice',
    'For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.',
    'It can reasonably be inferred from the passage that the grandmother considered a failed planting to be:',
    '[{"id":"A","text":"a reason to abandon that corner of the garden"},{"id":"B","text":"information worth keeping"},{"id":"C","text":"an embarrassment best left unrecorded"},{"id":"D","text":"proof that her methods were unsound"}]',
    'B', 'She recorded failures as carefully as successes and gardened "by evidence", which treats a failure as data. Nothing suggests she abandoned ground, hid results, or doubted her approach.'),

  ('reading', 'Key Ideas and Details', 'Detail', 'easy', 'multiple_choice',
    'Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.',
    'According to the passage, Carnegie''s grants required a town to:',
    '[{"id":"A","text":"repay the construction cost over ten years"},{"id":"B","text":"provide the site and commit annual public funding for operations"},{"id":"C","text":"name the library after Carnegie"},{"id":"D","text":"match his grant dollar for dollar before construction began"}]',
    'B', 'The passage states the two conditions directly: supply the site, and commit public money each year to running it. Repayment, naming and dollar-for-dollar matching are not mentioned.'),

  ('reading', 'Integration of Knowledge and Ideas', 'Author purpose', 'medium', 'multiple_choice',
    'Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.',
    'The author includes the final sentence primarily to:',
    '[{"id":"A","text":"show that the condition was a real constraint rather than a formality"},{"id":"B","text":"criticize the towns that declined the grants"},{"id":"C","text":"explain why library construction slowed after 1910"},{"id":"D","text":"suggest that Carnegie regretted imposing the condition"}]',
    'A', 'Naming towns that refused demonstrates that the requirement had teeth. The sentence passes no judgment on those towns, says nothing about the period after 1910, and reports nothing about Carnegie''s feelings.'),

  ('reading', 'Craft and Structure', 'Text structure', 'hard', 'multiple_choice',
    'Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.',
    'Which choice best describes the structure of the passage?',
    '[{"id":"A","text":"A statistic, then a common misunderstanding corrected, then evidence that the correction matters"},{"id":"B","text":"A claim, then two counterarguments, then a concession"},{"id":"C","text":"A chronological account of one library''s construction"},{"id":"D","text":"A comparison of philanthropic models in two countries"}]',
    'A', 'The passage opens with growth figures, notes a condition that is "often forgotten", and closes with towns that refused -- evidence the forgotten condition had consequences. There is no counterargument, no single library narrative and no second country.'),

  ('reading', 'Key Ideas and Details', 'Main idea', 'medium', 'multiple_choice',
    'The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.',
    'The main point of the passage is that the blue whale''s heart is remarkable for:',
    '[{"id":"A","text":"its size alone"},{"id":"B","text":"the range of rates at which it can operate"},{"id":"C","text":"how difficult it was to monitor"},{"id":"D","text":"how closely it resembles other mammalian hearts"}]',
    'B', 'The passage sets up size as "the whole story" only to replace it: the finding is the span from 37 beats a minute to 2. The difficulty of monitoring is background, and the closing sentence says the opposite of D.'),

  ('reading', 'Craft and Structure', 'Rhetorical effect', 'hard', 'multiple_choice',
    'The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.',
    'The sentence "Not slow -- 2." primarily serves to:',
    '[{"id":"A","text":"correct an error in the preceding sentence"},{"id":"B","text":"insist that the reader register how extreme the figure is"},{"id":"C","text":"introduce a measurement taken at a different depth"},{"id":"D","text":"concede that the monitoring may have been inaccurate"}]',
    'B', 'The fragment repeats the number rather than adding information, which is a way of refusing to let the reader skim past it. It corrects nothing, adds no new measurement and concedes nothing.'),

  ('reading', 'Integration of Knowledge and Ideas', 'Evidence', 'hard', 'multiple_choice',
    'The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.',
    'Which detail from the passage most directly supports the claim in the final sentence?',
    '[{"id":"A","text":"The heart is the size of a small car."},{"id":"B","text":"Researchers attached a monitor to a wild blue whale."},{"id":"C","text":"The rate falls from about 37 at the surface to 2 on a deep dive."},{"id":"D","text":"The finding was not predicted."}]',
    'C', 'The final sentence claims an unmatched operating range, and only the pair of rates establishes a range. Size supports the claim the sentence is arguing against, and the other two details describe the study rather than its result.'),

  ('reading', 'Key Ideas and Details', 'Detail', 'medium', 'multiple_choice',
    'Sourdough is not a recipe so much as a relationship. The starter is a living culture of wild yeast and lactic acid bacteria, and it eats on a schedule: fed too little, it sours and weakens; fed too much, it never develops flavor. Bakers speak of a starter''s "mood" and they are not being whimsical. A culture kept at 24 degrees Celsius behaves measurably differently from the same culture kept at 18, and the bread records the difference.',
    'According to the passage, a starter that is fed too much will:',
    '[{"id":"A","text":"sour and weaken"},{"id":"B","text":"fail to develop flavor"},{"id":"C","text":"change temperature"},{"id":"D","text":"stop rising entirely"}]',
    'B', 'The passage pairs each error with its consequence: too little food sours and weakens it, too much leaves it without flavor. The other options either swap the two or state something the passage does not.'),

  ('reading', 'Craft and Structure', 'Word meaning in context', 'medium', 'multiple_choice',
    'Sourdough is not a recipe so much as a relationship. The starter is a living culture of wild yeast and lactic acid bacteria, and it eats on a schedule: fed too little, it sours and weakens; fed too much, it never develops flavor. Bakers speak of a starter''s "mood" and they are not being whimsical. A culture kept at 24 degrees Celsius behaves measurably differently from the same culture kept at 18, and the bread records the difference.',
    'The author puts the word "mood" in quotation marks primarily to:',
    '[{"id":"A","text":"question whether bakers understand their own craft"},{"id":"B","text":"mark it as bakers'' shorthand for a real, measurable variation"},{"id":"C","text":"indicate that the word is being quoted from a specific source"},{"id":"D","text":"signal that the passage is about to change subject"}]',
    'B', 'The next sentence insists the bakers "are not being whimsical" and then gives temperature evidence, so the marks flag borrowed vocabulary for something genuine. The passage defends the bakers rather than questioning them.'),

  ('reading', 'Integration of Knowledge and Ideas', 'Inference', 'hard', 'multiple_choice',
    'Sourdough is not a recipe so much as a relationship. The starter is a living culture of wild yeast and lactic acid bacteria, and it eats on a schedule: fed too little, it sours and weakens; fed too much, it never develops flavor. Bakers speak of a starter''s "mood" and they are not being whimsical. A culture kept at 24 degrees Celsius behaves measurably differently from the same culture kept at 18, and the bread records the difference.',
    'The passage most strongly suggests that two bakers using identical ingredients and identical feeding schedules could still produce different bread because:',
    '[{"id":"A","text":"wild yeast varies from region to region"},{"id":"B","text":"the temperature at which each starter is kept may differ"},{"id":"C","text":"one baker may be more experienced than the other"},{"id":"D","text":"lactic acid bacteria die at room temperature"}]',
    'B', 'Ingredients and schedule are held fixed by the question, and the only other variable the passage names is temperature, which it says produces measurable differences. Regional yeast, experience and bacterial death are never mentioned.'),

  -- ========================= Science =========================

  ('science', 'Interpretation of Data', 'Reading a table', 'easy', 'multiple_choice',
    'Students measured how long a 50 mL sample of water took to reach 80 degrees Celsius on a hot plate at four power settings.

Setting | Power (W) | Time to 80 C (s)
1       | 250       | 412
2       | 500       | 196
3       | 750       | 141
4       | 1000      | 103',
    'Based on the table, as power setting increases, the time to reach 80 degrees Celsius:',
    '[{"id":"A","text":"increases only"},{"id":"B","text":"decreases only"},{"id":"C","text":"increases, then decreases"},{"id":"D","text":"remains constant"}]',
    'B', 'The times fall from 412 to 196 to 141 to 103 seconds, decreasing at every step.'),

  ('science', 'Interpretation of Data', 'Interpolation', 'medium', 'multiple_choice',
    'Students measured how long a 50 mL sample of water took to reach 80 degrees Celsius on a hot plate at four power settings.

Setting | Power (W) | Time to 80 C (s)
1       | 250       | 412
2       | 500       | 196
3       | 750       | 141
4       | 1000      | 103',
    'If the experiment were repeated at 625 W, the time to reach 80 degrees Celsius would most likely be closest to:',
    '[{"id":"A","text":"110 s"},{"id":"B","text":"165 s"},{"id":"C","text":"250 s"},{"id":"D","text":"400 s"}]',
    'B', '625 W lies between 500 W and 750 W, so the time should lie between 196 s and 141 s. Only 165 s falls in that interval.'),

  ('science', 'Evaluation of Models, Inferences, and Experimental Results', 'Proportional reasoning', 'hard', 'multiple_choice',
    'Students measured how long a 50 mL sample of water took to reach 80 degrees Celsius on a hot plate at four power settings.

Setting | Power (W) | Time to 80 C (s)
1       | 250       | 412
2       | 500       | 196
3       | 750       | 141
4       | 1000      | 103',
    'A student claims that doubling the power always halves the heating time exactly. The data most strongly support which evaluation of that claim?',
    '[{"id":"A","text":"Supported, because 500 W took less than half the time of 250 W"},{"id":"B","text":"Not supported, because 500 W took slightly less than half the time of 250 W and 1000 W took slightly more than half the time of 500 W"},{"id":"C","text":"Supported, because time decreases whenever power increases"},{"id":"D","text":"Not supported, because time increased at one of the settings"}]',
    'B', 'Half of 412 is 206 and the measured value is 196, so the first doubling beat the prediction; half of 196 is 98 and the measured value at 1000 W is 103, so the second doubling missed it. The relationship is close to inverse but not exact. Time never increased, which rules out D, and mere direction is not the claim, which rules out C.'),

  ('science', 'Scientific Investigation', 'Experimental design', 'medium', 'multiple_choice',
    'Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7',
    'In Experiment 1, keeping every lamp at the same intensity was necessary in order to:',
    '[{"id":"A","text":"ensure that the seedlings received enough total light to survive"},{"id":"B","text":"make light color the only variable differing among the groups"},{"id":"C","text":"reduce the total time the experiment required"},{"id":"D","text":"allow the results to be compared with Experiment 2"}]',
    'B', 'Holding intensity constant isolates color as the manipulated variable. If intensity varied with color, a height difference could be caused by either, and the experiment would answer neither question.'),

  ('science', 'Interpretation of Data', 'Comparing results', 'easy', 'multiple_choice',
    'Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7',
    'According to Experiment 1, which lamp color produced the shortest seedlings?',
    '[{"id":"A","text":"Red"},{"id":"B","text":"Blue"},{"id":"C","text":"Green"},{"id":"D","text":"White"}]',
    'C', 'Green produced a mean height of 6.8 cm, lower than every other color.'),

  ('science', 'Evaluation of Models, Inferences, and Experimental Results', 'Hypothesis evaluation', 'hard', 'multiple_choice',
    'Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7',
    'A researcher hypothesizes that chlorophyll absorbs green light poorly. Which result from Experiment 1 is most consistent with that hypothesis?',
    '[{"id":"A","text":"Blue produced the tallest seedlings."},{"id":"B","text":"Green produced seedlings roughly half the height of those under white light."},{"id":"C","text":"Red and white produced similar heights."},{"id":"D","text":"All four groups grew for the same 21 days."}]',
    'B', 'Poor absorption of green light means less usable energy and therefore less growth, which is exactly the deficit the green group shows against the white control. A is consistent with strong blue absorption but does not bear on green, and C and D say nothing about green at all.'),

  ('science', 'Scientific Investigation', 'Controls', 'medium', 'multiple_choice',
    'A student tested whether a commercial rust inhibitor slows corrosion. Ten identical iron nails were coated with inhibitor and left in salt water; ten uncoated nails were left in fresh water. After two weeks the coated nails showed less rust.',
    'The student''s conclusion that the inhibitor slows corrosion is weakened primarily because:',
    '[{"id":"A","text":"only ten nails were used in each group"},{"id":"B","text":"the two groups differed in the water used as well as in the coating"},{"id":"C","text":"two weeks is not long enough for iron to rust"},{"id":"D","text":"rust was assessed by appearance rather than by mass"}]',
    'B', 'Two variables changed at once, and salt water is the more corrosive of the two -- so the coated nails rusted less despite the harsher condition, which the design cannot separate from the coating. Sample size and measurement method are secondary, and iron visibly rusts well within two weeks.'),

  ('science', 'Interpretation of Data', 'Reading a graph description', 'medium', 'multiple_choice',
    'Dissolved oxygen was measured at four depths in a lake in July and again in January.

Depth (m) | July DO (mg/L) | January DO (mg/L)
0         | 8.9            | 12.6
5         | 8.1            | 12.4
10        | 4.2            | 12.0
20        | 0.6            | 11.5',
    'The difference between July and January dissolved oxygen is greatest at which depth?',
    '[{"id":"A","text":"0 m"},{"id":"B","text":"5 m"},{"id":"C","text":"10 m"},{"id":"D","text":"20 m"}]',
    'D', 'At 20 m the difference is 11.5 minus 0.6, or 10.9 mg/L, larger than 3.7, 4.3 and 7.8 at the shallower depths.'),

  ('science', 'Evaluation of Models, Inferences, and Experimental Results', 'Inference', 'hard', 'multiple_choice',
    'Dissolved oxygen was measured at four depths in a lake in July and again in January.

Depth (m) | July DO (mg/L) | January DO (mg/L)
0         | 8.9            | 12.6
5         | 8.1            | 12.0
10        | 4.2            | 11.8
20        | 0.6            | 11.5',
    'The January measurements differ from the July measurements most importantly in that in January:',
    '[{"id":"A","text":"oxygen is nearly uniform with depth"},{"id":"B","text":"oxygen falls sharply below 5 m"},{"id":"C","text":"oxygen is lowest at the surface"},{"id":"D","text":"oxygen exceeds 15 mg/L at every depth"}]',
    'A', 'The January values run 12.6, 12.0, 11.8, 11.5 -- a spread of about 1 mg/L across 20 m, against a July spread of more than 8. The sharp drop below 5 m is the July pattern, not January''s.'),

  ('science', 'Interpretation of Data', 'Trend identification', 'easy', 'multiple_choice',
    'A chemist measured the solubility of a salt in water at several temperatures.

Temperature (C) | Solubility (g per 100 mL)
10              | 21
20              | 32
30              | 46
40              | 63
50              | 84',
    'Based on the table, solubility at 25 degrees Celsius would most likely be closest to:',
    '[{"id":"A","text":"26 g per 100 mL"},{"id":"B","text":"39 g per 100 mL"},{"id":"C","text":"46 g per 100 mL"},{"id":"D","text":"55 g per 100 mL"}]',
    'B', '25 C lies between 20 C and 30 C, so solubility lies between 32 and 46 g per 100 mL. Only 39 falls in that interval.'),

  ('science', 'Scientific Investigation', 'Extending a procedure', 'medium', 'multiple_choice',
    'A chemist measured the solubility of a salt in water at several temperatures.

Temperature (C) | Solubility (g per 100 mL)
10              | 21
20              | 32
30              | 46
40              | 63
50              | 84',
    'To test whether the relationship between temperature and solubility continues above 50 degrees Celsius, the chemist should:',
    '[{"id":"A","text":"repeat the measurement at 50 degrees Celsius several more times"},{"id":"B","text":"measure solubility at 60 and 70 degrees Celsius using the same procedure"},{"id":"C","text":"measure solubility of a different salt at the same temperatures"},{"id":"D","text":"measure solubility at 5 degrees Celsius"}]',
    'B', 'The question is about behavior above 50 C, so the procedure must be extended to temperatures above 50 C. Repeating an existing point tests precision, a different salt tests a different substance, and 5 C extends the range in the wrong direction.'),

  ('science', 'Evaluation of Models, Inferences, and Experimental Results', 'Conflicting viewpoints', 'hard', 'multiple_choice',
    'Scientist 1 argues that the megafauna of North America died out primarily because of rapid climate warming at the end of the last glacial period, which fragmented the habitats large herbivores depended on.
Scientist 2 argues that human hunting was the primary cause, noting that extinctions on several continents track the arrival of humans more closely than they track any climate signal.',
    'Which finding, if confirmed, would most weaken Scientist 2''s argument?',
    '[{"id":"A","text":"Butchery marks on mammoth bones are found at several sites in North America."},{"id":"B","text":"On a continent where humans arrived thousands of years before the warming, megafauna persisted until the warming began."},{"id":"C","text":"Human populations grew quickly after the megafauna declined."},{"id":"D","text":"Some large herbivores survived in isolated regions for several thousand more years."}]',
    'B', 'Scientist 2 rests on extinctions tracking human arrival. A continent where humans arrived long before and the animals survived until the climate changed breaks exactly that correlation. A supports Scientist 2, C is ambiguous about direction, and D is compatible with either account.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'act'
on conflict (exam_id, md5(coalesce(stimulus, '') || E'\x1f' || question_text)) do nothing;

-- Now, and only now, the ACT becomes available: there is something behind
-- the card. The status flip lives here rather than in the definitions
-- migration so an exam can never be switched on with an empty bank.
update public.exam_definitions
set status = 'available'
where slug = 'act'
  and exists (
    select 1 from public.diagnostic_questions q
    where q.exam_id = exam_definitions.id and q.status = 'published'
  );
