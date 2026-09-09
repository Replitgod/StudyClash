-- Question quality: answer keys spread, and weak distractors rewritten.
--
-- The bank shipped with 67 percent of its NCLEX keys on B, and between 42
-- and 63 percent on B everywhere else. A candidate who guessed B on every
-- NCLEX question would have scored 67 percent without reading one of them.
-- That is not cosmetic: it makes the bank useless for measuring anything,
-- and it teaches a habit that fails on the real exam, where this flaw has
-- been edited out.
--
-- It is a known property of AI-written items. lib/server/questionShuffle.ts
-- already said so in a comment and already fixed it for deck questions; it
-- was never applied to the exam banks, which are served in stored order.
--
-- Eighteen questions also had their options rewritten outright. On the SAT
-- evidence and inference items the key was a careful, precise sentence and
-- the distractors were throwaways -- "The study lasted eight weeks",
-- "Farmers markets are seasonal" -- so picking the longest option scored
-- 100 percent on that whole set. Every option is now a real finding from
-- the passage, and the wrong ones fail because they do not ISOLATE the
-- variable the claim rests on, which is the reasoning the exam actually
-- tests. See scripts/question-rewrites.ts for the authored source.
--
-- Each question below had its key transposed into a new position and its
-- explanation rewritten to match -- 47 of them say things like "Choice A
-- inverts the definition of a catalyst", and moving the options without
-- moving that sentence would make the explanation a lie. Every rewrite was
-- verified by lib/server/keyBalance.ts before it was accepted: the new
-- explanation must be exactly the remap of the old one, and every letter it
-- cites must still point at the same option text.
--
-- Matched on (stimulus, question_text) -- the same identity the unique index
-- uses -- so this is portable across databases and idempotent: re-running it
-- writes the same values.
--
-- Emitted in chunks rather than as one enormous UPDATE. A 900-line statement
-- is unreadable in a diff, and it exceeds what the PostgreSQL parser used to
-- verify these files can hold in one piece -- so a single statement could not
-- be checked before shipping, which defeats the point of checking.

update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  (null, 'If g(x) = 3x - 4, what is the value of x for which g(x) = 11?',
   'null',
   '5', 'This asks for the input, not the output, so set the rule equal to 11 rather than substituting 11 for x: 3x - 4 = 11, so 3x = 15 and x = 5. Substituting 11 for x instead gives g(11) = 29, which answers a different question.'),

  (null, 'A recipe calls for 2 cups of flour for every 3 cups of water. If a chef uses 9 cups of water, how many cups of flour are needed?',
   'null',
   '6', 'Set up the proportion 2/3 = x/9. Solving gives x = 6.'),

  (null, 'If x + y = 10 and x - y = 4, what is the value of x?',
   'null',
   '7', 'Adding the two equations gives 2x = 14, so x = 7.'),

  (null, 'A circle has a circumference of 18π. What is the area of the circle?',
   '[{"id":"A","text":"9π"},{"id":"B","text":"81π"},{"id":"C","text":"18π"},{"id":"D","text":"162π"}]',
   'B', 'Circumference = 2πr = 18π, so r = 9. Area = πr^2 = 81π.'),

  ('Marine biologists tagged forty sea turtles along a coastal migration route and tracked their movements for three years. The data showed that turtles consistently avoided areas with heavy boat traffic, even when those areas contained abundant food sources. The researchers concluded that noise and vibration from boat engines, not food scarcity, primarily drove the turtles'' route choices.', 'Which finding from the study most directly supports the researchers'' conclusion?',
   '[{"id":"A","text":"Turtles were tracked along the route for three consecutive years."},{"id":"B","text":"Turtles avoided high-traffic areas even where food was abundant."},{"id":"C","text":"Forty turtles were tagged, enough to average out individual variation."},{"id":"D","text":"Turtles moved freely through low-traffic areas that held little food."}]',
   'B', 'The conclusion singles out engine noise over food scarcity, so the evidence has to separate the two. Only avoidance despite abundant food does that: the food was there and the turtles still stayed away. Choice D leaves both explanations standing, and sample size and duration say how confident the study is rather than what it found.'),

  (null, 'The average (arithmetic mean) of five numbers is 20. If one of the numbers is removed and the average of the remaining four numbers is 18, what was the value of the number that was removed?',
   '[{"id":"A","text":"22"},{"id":"B","text":"24"},{"id":"C","text":"28"},{"id":"D","text":"26"}]',
   'C', 'Sum of five numbers = 100. Sum of remaining four = 72. Removed number = 100 - 72 = 28.'),

  (null, 'A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?',
   '[{"id":"A","text":"9"},{"id":"B","text":"12"},{"id":"C","text":"14"},{"id":"D","text":"10"}]',
   'D', 'By the Pythagorean theorem, sqrt(6^2 + 8^2) = sqrt(36 + 64) = sqrt(100) = 10.'),

  (null, 'A shirt originally priced at $40 is on sale for 25% off. What is the sale price?',
   '[{"id":"A","text":"$10"},{"id":"B","text":"$28"},{"id":"C","text":"$35"},{"id":"D","text":"$30"}]',
   'D', '25% of $40 is $10, so the sale price is $40 - $10 = $30.'),

  (null, 'What is the value of 2^3 * 2^2?',
   '[{"id":"A","text":"4^5"},{"id":"B","text":"2^6"},{"id":"C","text":"2^5"},{"id":"D","text":"4^6"}]',
   'C', 'Multiplying powers of the same base adds the exponents, so 2^3 times 2^2 is 2^(3+2) = 2^5, or 32. Choice B multiplies the exponents instead of adding them, and the two base-4 options come from multiplying the bases together as well -- the base does not change when powers are multiplied.'),

  (null, 'A company sells two types of tickets: standard tickets for $15 and VIP tickets for $40. On a night when 200 tickets were sold for a total of $4,250, how many VIP tickets were sold?',
   'null',
   '50', 'Let s + v = 200 and 15s + 40v = 4250. Substituting s = 200 - v gives 25v = 1250, so v = 50.'),

  ('The recipe, tested by three generations of the same family, calls for a pinch of cinnamon ______ most modern versions leave out entirely.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"who"},{"id":"B","text":"that"},{"id":"C","text":"whom"},{"id":"D","text":"being"}]',
   'B', '"That" correctly introduces a restrictive clause describing the cinnamon (a thing, not a person).'),

  ('After weeks of drought, the reservoir''s water level had grown alarmingly ______, prompting the city council to enact strict watering restrictions.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"abundant"},{"id":"B","text":"irrelevant"},{"id":"C","text":"low"},{"id":"D","text":"colorful"}]',
   'C', 'The context (drought, watering restrictions) requires a word meaning depleted; "low" fits, while the others contradict the scenario.'),

  ('A city library replaced its overdue fines with a simple reminder-text system. Six months later, the number of returned books on time had risen by eighteen percent, and staff reported that patrons seemed less anxious about visiting the library at all.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"Patrons returned eighteen percent more books on time after the switch."},{"id":"B","text":"Staff reported that patrons seemed less anxious about visiting at all."},{"id":"C","text":"Six months passed between the change and the staff''s observations."},{"id":"D","text":"Replacing fines with reminder texts was followed by better returns and calmer patrons."}]',
   'D', 'A main-idea question wants the claim the whole passage supports, not one finding inside it. The higher on-time returns and the reduced anxiety are the two pieces of evidence for that claim, and the six-month gap is a detail of timing. A true detail is still the wrong answer to this question.'),

  ('The volunteers arrived at dawn, eager to finish the trail repairs before the ______ afternoon heat made outdoor work unsafe.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"mild"},{"id":"B","text":"forecasted"},{"id":"C","text":"pleasant"},{"id":"D","text":"scorching"}]',
   'D', 'The urgency to finish before the heat becomes unsafe requires an extreme word; "scorching" fits, the others contradict the danger described.'),

  ('A teacher gave the same quiz to two classes. The class that reviewed practice questions the night before scored an average of ten points higher than the class that did not, even though both classes had covered identical material in class that week.', 'Which finding most directly supports the idea that the practice review, not the class material, caused the score difference?',
   '[{"id":"A","text":"The reviewing class had also scored higher on the previous quiz."},{"id":"B","text":"Both classes covered the same material in the week before the quiz."},{"id":"C","text":"Students who reviewed said they felt better prepared for the quiz."},{"id":"D","text":"The reviewing class scored ten points higher despite covering identical material."}]',
   'D', 'The claim is that the review, not the teaching, produced the gap, so the evidence must hold the teaching constant and still show a difference. Choice B holds it constant but reports no difference. Choice A actively undermines the claim -- a class already ahead may owe nothing to the review -- and how students felt is not a score.'),

  ('An urban planner compared two neighborhoods with nearly identical income levels and population density. The neighborhood with a new pedestrian plaza saw local restaurant revenue rise by twenty percent over two years, while the neighborhood without a plaza saw revenue stay flat over the same period.', 'Which finding from the study most directly supports the idea that the pedestrian plaza, not income or density, drove the revenue increase?',
   '[{"id":"A","text":"Restaurant revenue in the plaza neighborhood rose twenty percent over two years."},{"id":"B","text":"The neighborhoods matched on income and density, yet only the plaza one gained revenue."},{"id":"C","text":"Both neighborhoods were tracked across the same two-year period."},{"id":"D","text":"The neighborhood without a plaza started with slightly fewer restaurants."}]',
   'B', 'Only the first option names the comparison that rules the alternatives out: the two neighborhoods matched on income and density and still diverged. Choice A is the result with nothing to compare it against, and choice D introduces a difference between them, which weakens the argument rather than supporting it.'),

  (null, 'A theater sells adult tickets for $12 and child tickets for $7. One evening, 150 tickets were sold for a total of $1,400. How many adult tickets were sold?',
   'null',
   '70', 'Let a + c = 150 and 12a + 7c = 1400. Substituting c = 150 - a gives 5a = 350, so a = 70.'),

  ('An economist compared prices at farmers markets that accepted only cash to those that also accepted cards. Markets accepting cards saw average per-visit spending rise by thirty percent, even though the number of vendors and the range of goods sold were nearly identical between the two groups.', 'Which finding from the study most directly supports the idea that payment method, not vendor variety, drove the spending difference?',
   '[{"id":"A","text":"Card-accepting markets took thirty percent more per visit despite similar vendors and goods."},{"id":"B","text":"Markets that accepted cards saw average per-visit spending rise by thirty percent."},{"id":"C","text":"The two groups of markets sold a similar range of goods."},{"id":"D","text":"Card-accepting markets tended to sit in wealthier neighborhoods."}]',
   'A', 'The argument needs vendor variety held constant and spending still differing, which is what the first option states. Choices B and C are the two halves of that on their own, and neither alone rules the other explanation out. Choice D supplies a rival explanation and works against the claim.'),

  ('The bridge was closed for inspection only one day a year. ______, the engineers used that single day to run every safety test the schedule allowed.', 'Which choice completes the text with the most logical transition?',
   '[{"id":"A","text":"Similarly,"},{"id":"B","text":"In contrast,"},{"id":"C","text":"Therefore,"},{"id":"D","text":"For instance,"}]',
   'C', 'The engineers'' use of the single available day is a direct consequence of the closure being so rare -- "Therefore" signals that cause-and-effect link.'),

  ('The article begins by profiling a single beekeeper struggling with colony losses, then expands to examine declining bee populations across the entire region, and finally proposes a policy response at the state level.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It contrasts two beekeepers with opposing methods."},{"id":"B","text":"It moves from an individual case to a regional problem to a proposed solution."},{"id":"C","text":"It presents a policy first, then illustrates it with one example."},{"id":"D","text":"It refutes a claim using historical data."}]',
   'B', 'The described order -- one beekeeper, then the region, then a policy proposal -- is exactly a case-to-problem-to-solution structure.'),

  ('A nutritionist tracked two groups of office workers over eight weeks. The group given standing desks reported no significant change in daily step count, but both groups showed similar improvements in reported energy levels. The nutritionist concluded that the standing desks themselves were not the main driver of the energy improvements.', 'Which finding from the study most directly supports the nutritionist''s conclusion?',
   '[{"id":"A","text":"Reported energy levels improved across the eight weeks of the study."},{"id":"B","text":"The group given standing desks reported no real change in daily step count."},{"id":"C","text":"Both groups, with and without standing desks, showed similar energy improvements."},{"id":"D","text":"Workers given standing desks spent more of the day on their feet."}]',
   'C', 'The conclusion is that the desks were NOT the driver, and a negative claim is supported by showing the outcome appeared without the cause. Both groups improving similarly does exactly that. Choice B is about steps rather than energy, choice A reports the improvement without saying who had it, and choice D would support the opposite conclusion.'),

  (null, 'In a classroom, the ratio of boys to girls is 3 to 4. If there are 12 boys, how many girls are there?',
   'null',
   '16', 'Set up the proportion 3/4 = 12/x. Solving gives x = 16.'),

  (null, 'A phone plan charges a flat fee of $20 plus $0.10 per text message. If Maria''s bill was $35, how many text messages did she send?',
   'null',
   '150', '20 + 0.10x = 35 -> 0.10x = 15 -> x = 150.'),

  (null, 'A ball''s height in feet is modeled by h(t) = -16t^2 + 64t, where t is time in seconds after launch. At what time does the ball reach its maximum height?',
   '[{"id":"A","text":"1"},{"id":"B","text":"4"},{"id":"C","text":"3"},{"id":"D","text":"2"}]',
   'D', 'The vertex of h(t) = -16t^2 + 64t occurs at t = -b/(2a) = -64/(2*-16) = 2.'),

  (null, 'A store increases the price of an item by 25%, then later decreases the new price by 20%. What is the overall percent change from the original price?',
   '[{"id":"A","text":"-5%"},{"id":"B","text":"+20%"},{"id":"C","text":"+5%"},{"id":"D","text":"0%"}]',
   'D', 'Starting at 100: after +25% it is 125; after -20% it is 125 * 0.8 = 100, which is the original price -- a 0% overall change.'),

  (null, 'In a triangle, two angles measure 50 degrees and 65 degrees. What is the measure of the third angle?',
   '[{"id":"A","text":"55"},{"id":"B","text":"75"},{"id":"C","text":"65"},{"id":"D","text":"115"}]',
   'C', 'A triangle''s angles sum to 180 degrees: 180 - 50 - 65 = 65.'),

  (null, 'A data set of six numbers has a mean of 15. If five of the numbers are 10, 12, 14, 18, and 20, what is the sixth number?',
   '[{"id":"A","text":"14"},{"id":"B","text":"15"},{"id":"C","text":"18"},{"id":"D","text":"16"}]',
   'D', 'The six numbers sum to 90. The five given numbers sum to 74, so the sixth is 90 - 74 = 16.'),

  (null, 'A jacket costs $80 after a 20% discount is applied to its original price. What was the original price?',
   '[{"id":"A","text":"$96"},{"id":"B","text":"$88"},{"id":"C","text":"$64"},{"id":"D","text":"$100"}]',
   'D', 'If the original price is p, then 0.8p = 80, so p = 100.'),

  (null, 'If 2x + y = 11 and x - y = 1, what is the value of y?',
   '[{"id":"A","text":"1"},{"id":"B","text":"3"},{"id":"C","text":"2"},{"id":"D","text":"4"}]',
   'B', 'From x - y = 1, x = y + 1. Substituting: 2(y+1) + y = 11 -> 3y + 2 = 11 -> y = 3.'),

  (null, 'A nurse begins a shift with four assigned clients. Which client should the nurse assess first?',
   '[{"id":"A","text":"A client who is two hours postoperative and reports incisional pain rated 6 out of 10"},{"id":"B","text":"A client scheduled for discharge who has questions about a new medication"},{"id":"C","text":"A client with new-onset shortness of breath and an oxygen saturation of 88 percent on room air"},{"id":"D","text":"A client with a chronic pressure injury due for a dressing change"}]',
   'C', 'Airway and breathing come before everything else. A saturation of 88 percent with new shortness of breath is an oxygenation problem that will worsen without intervention. The postoperative pain is expected and treatable but not immediately life-threatening, the discharge teaching can wait, and a chronic wound is stable by definition. The reusable principle: acute beats chronic, and within acute, the ABCs decide the order.'),

  (null, 'What is the value of (3^4)/(3^2)?',
   '[{"id":"A","text":"3^8"},{"id":"B","text":"3^6"},{"id":"C","text":"3^2"},{"id":"D","text":"1^2"}]',
   'C', 'Dividing powers of the same base subtracts the exponents: 3^4 divided by 3^2 is 3^(4-2) = 3^2, or 9. Choice B adds them, choice A multiplies them, and choice D divides the bases as well -- the base is unchanged by division.'),

  (null, 'The product of two consecutive positive integers is 132. What is the smaller integer?',
   'null',
   '11', 'n(n+1) = 132 -> n^2 + n - 132 = 0 -> (n-11)(n+12) = 0, so n = 11 (the positive solution).'),

  (null, 'A rectangle''s length is 3 more than twice its width. If the perimeter of the rectangle is 36, what is the width?',
   'null',
   '5', 'Let w be the width; length = 2w + 3. Perimeter: 2(w + 2w + 3) = 6w + 6 = 36, so w = 5.'),

  (null, 'A map has a scale where 2 inches represents 15 miles. If two cities are 7 inches apart on the map, how many miles apart are they in reality?',
   'null',
   '52.5', 'Set up the proportion 2/15 = 7/x. Solving gives x = 15 * 7 / 2 = 52.5.'),

  (null, 'A circle has an area of 64π. A central angle of 90 degrees cuts out a sector of the circle. What is the area of that sector?',
   '[{"id":"A","text":"16π"},{"id":"B","text":"8π"},{"id":"C","text":"32π"},{"id":"D","text":"64π"}]',
   'A', 'The radius satisfies r^2 = 64, so the sector area is (90/360) * 64π = 16π.'),

  ('The bakery''s new oven bakes bread twice as fast as the old one. ______, the head baker was hesitant to switch entirely, worried that speed might come at the cost of flavor.', 'Which choice completes the text with the most logical transition?',
   '[{"id":"A","text":"Similarly,"},{"id":"B","text":"Nevertheless,"},{"id":"C","text":"As a result,"},{"id":"D","text":"For example,"}]',
   'B', 'The second sentence contrasts with the first (faster oven, but hesitation), so a contrast transition is needed.'),

  (null, 'A store''s revenue increased from $80,000 to $92,000 over one year. What was the percent increase in revenue?',
   '[{"id":"A","text":"15%"},{"id":"B","text":"12%"},{"id":"C","text":"18%"},{"id":"D","text":"20%"}]',
   'A', '(92,000 - 80,000) / 80,000 = 12,000 / 80,000 = 0.15 = 15%.'),

  (null, 'A fruit punch recipe uses juice and soda in a ratio of 5 to 2. If a batch uses 10 cups of juice, how many cups of soda are needed?',
   'null',
   '4', 'Set up the proportion 5/2 = 10/x. Solving gives x = 4.'),

  (null, 'If y = 3x and x + y = 16, what is the value of x?',
   'null',
   '4', 'Substituting: x + 3x = 16 -> 4x = 16 -> x = 4.'),

  (null, 'If f(x) = x^2 - 4x, for what positive value of x does f(x) = 0?',
   'null',
   '4', 'x^2 - 4x = 0 -> x(x - 4) = 0, so x = 0 or x = 4. The positive value is 4.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;


update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  (null, 'A circle has a diameter of 14. What is its area, in terms of π?',
   '[{"id":"A","text":"7π"},{"id":"B","text":"14π"},{"id":"C","text":"98π"},{"id":"D","text":"49π"}]',
   'D', 'The radius is half the diameter, 7. Area = πr^2 = 49π.'),

  (null, 'If f(x) = 2x^2 - 3, what is f(3)?',
   '[{"id":"A","text":"9"},{"id":"B","text":"15"},{"id":"C","text":"12"},{"id":"D","text":"18"}]',
   'B', 'Substitute 3 for every x, then follow the order of operations: square first, so 3^2 = 9; multiply, so 2(9) = 18; subtract last, giving 15. Multiplying before squaring gives (2*3)^2 - 3 = 33, which is the usual wrong answer here.'),

  (null, 'What is the value of (2^5)^2?',
   '[{"id":"A","text":"2^10"},{"id":"B","text":"2^7"},{"id":"C","text":"2^25"},{"id":"D","text":"4^5"}]',
   'A', 'A power raised to a power multiplies the exponents, so (2^5)^2 is 2^(5x2) = 2^10, or 1024. Choice B adds them, which is the rule for multiplying two powers rather than raising one to a power, and choice D squares the base instead of applying the outer exponent to the whole expression.'),

  ('A student is writing about a factory''s shift to a four-day work week and has these notes: (1) Weekly output stayed within two percent of the previous five-day schedule. (2) Employee overtime requests dropped by half. (3) The factory redesigned shift handoffs to avoid production gaps. (4) A few long-time employees said they missed the old schedule''s routine.', 'The student wants to argue that the four-day schedule maintained productivity without relying on more overtime. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Weekly output held within two percent even as overtime requests dropped by half."},{"id":"B","text":"Overtime requests dropped by half after the factory moved to four days."},{"id":"C","text":"Redesigned shift handoffs kept output within two percent of the old schedule."},{"id":"D","text":"Weekly output held steady, though some long-time employees missed the routine."}]',
   'A', 'The argument has two halves -- productivity held, and it held without more overtime -- so the sentence has to carry both. Choice B has only the overtime, choice C credits the handoffs rather than the schedule, and choice D pairs the output with an unrelated complaint.'),

  ('Neither the interns nor the manager ______ available to answer questions during the outage.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"were"},{"id":"B","text":"have been"},{"id":"C","text":"are"},{"id":"D","text":"was"}]',
   'D', 'With "neither...nor," the verb agrees with the closer subject, the singular "manager," so "was" is correct.'),

  ('The new traffic algorithm reduced average commute times by twelve percent in simulation testing. ______, when deployed on actual city streets, commute times improved by less than two percent, revealing a significant gap between simulated and real-world performance.', 'Which choice completes the text with the most logical transition?',
   '[{"id":"A","text":"However,"},{"id":"B","text":"In fact,"},{"id":"C","text":"Consequently,"},{"id":"D","text":"Specifically,"}]',
   'A', 'The second sentence contrasts sharply with the simulated result, requiring a contrast transition.'),

  ('Reviewers called the sequel''s plot twist ______, noting that the same reveal had appeared, almost unchanged, in the studio''s previous three films.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"inventive"},{"id":"B","text":"shocking"},{"id":"C","text":"derivative"},{"id":"D","text":"ambiguous"}]',
   'C', 'A twist that repeats a prior reveal almost unchanged is "derivative," not original -- the other choices contradict that description.'),

  ('The report, along with its supporting spreadsheets, ______ due at the end of the fiscal quarter.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"is"},{"id":"B","text":"are"},{"id":"C","text":"were"},{"id":"D","text":"have been"}]',
   'A', '"Along with its supporting spreadsheets" is a parenthetical that doesn''t change the subject''s number -- the singular "report" takes "is".'),

  ('The essay opens by describing a single abandoned lighthouse in vivid detail, then gradually widens its focus to discuss the decline of lighthouse keeping as a profession across the entire coastline.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It presents two competing arguments and resolves them with a compromise."},{"id":"B","text":"It refutes a common misconception using statistical evidence."},{"id":"C","text":"It compares two lighthouses in different countries."},{"id":"D","text":"It moves from a specific example to a broader discussion of a general trend."}]',
   'D', 'The description explicitly narrows-to-wide: one lighthouse, then the broader trend across the coastline.'),

  ('The startup''s pitch deck was ______ with technical jargon, so the investors asked the team to explain their product in plain language before continuing.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"sparse"},{"id":"B","text":"devoid"},{"id":"C","text":"laden"},{"id":"D","text":"unfamiliar"}]',
   'C', 'Investors asking for plain language implies the deck was heavily loaded with jargon; "laden" fits, while "sparse" and "devoid" contradict that.'),

  ('The article opens with a short definition of urban heat islands, then lists three cities using reflective rooftops to address the problem.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It tells a personal story about visiting three cities."},{"id":"B","text":"It argues two opposing positions without resolution."},{"id":"C","text":"It defines a concept, then gives examples of a response to it."},{"id":"D","text":"It disproves a widely held scientific theory."}]',
   'C', 'The passage moves from a definition to concrete examples of cities responding to the defined problem.'),

  ('The pilot program cut wait times by forty percent in its first month. ______, enrollment dropped sharply once the program expanded citywide and lost its original, smaller-scale staffing ratio.', 'Which choice completes the text with the most logical transition?',
   '[{"id":"A","text":"However,"},{"id":"B","text":"Similarly,"},{"id":"C","text":"As a result,"},{"id":"D","text":"In addition,"}]',
   'A', 'The second sentence describes a reversal of the first''s success once the program scaled up, requiring a contrast transition.'),

  ('A regional hospital piloted a program pairing new nurses with a mentor for their first ninety days. Nurses in the program left within their first year at less than half the rate of nurses hired the previous year, before the program existed.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"The hospital paired each new nurse with a mentor for their first ninety days."},{"id":"B","text":"New nurses in the mentorship program left within a year at less than half the previous rate."},{"id":"C","text":"Turnover among experienced nurses fell over the same period."},{"id":"D","text":"New nurses reported feeling more confident after ninety days on the unit."}]',
   'B', 'The main idea is the outcome the passage reports: turnover among new nurses roughly halved alongside the program. The pairing is the intervention rather than the finding, and the other two are plausible results the passage never measures -- it says nothing about experienced nurses or about confidence.'),

  ('The senator''s response to the scandal was widely seen as ______, offering neither an apology nor a denial, just a vague promise to look into the matter.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"evasive"},{"id":"B","text":"decisive"},{"id":"C","text":"candid"},{"id":"D","text":"apologetic"}]',
   'A', 'Offering neither an apology nor a denial, only vagueness, is the definition of an evasive response.'),

  ('A historian re-examined a decades-old assumption that a medieval town''s decline was caused solely by plague. Reviewing tax and trade records, the historian found that the town''s trade revenue had already been falling for twenty years before the plague arrived, driven by a new overland route that bypassed the town entirely.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"The town''s trade revenue had been falling for twenty years before the plague arrived."},{"id":"B","text":"A new overland route bypassed the town and helped drive its decline before the plague."},{"id":"C","text":"The plague reached the town later than historians had previously assumed."},{"id":"D","text":"Tax and trade records are the most reliable source for medieval town histories."}]',
   'B', 'The passage complicates a plague-only explanation by naming a second, earlier cause. The twenty-year decline is the evidence for that claim rather than the claim itself; the timing of the plague''s arrival is never discussed; and the historian uses tax records without arguing they are the best kind of source.'),

  ('The startup cut its marketing budget by half to extend its runway. ______, user signups continued to grow at nearly the same rate as before the cut.', 'Which choice completes the text with the most logical transition?',
   '[{"id":"A","text":"Consequently,"},{"id":"B","text":"Specifically,"},{"id":"C","text":"Similarly,"},{"id":"D","text":"Surprisingly,"}]',
   'D', 'Continued growth despite a major budget cut is an unexpected outcome, so "Surprisingly" fits best.'),

  ('The video tutorial starts with a list of required tools, then walks through each assembly step in order, and finishes with a troubleshooting section for common mistakes.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It compares two different tutorials."},{"id":"B","text":"It lists requirements, walks through steps in order, then addresses common problems."},{"id":"C","text":"It argues against following instructions in order."},{"id":"D","text":"It begins with troubleshooting before explaining the steps."}]',
   'B', 'The order given -- tools, then steps, then troubleshooting -- matches only choice B.'),

  ('Not only the lead actor but also the supporting cast members ______ praised for their performances in the reviews.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"were"},{"id":"B","text":"is"},{"id":"C","text":"was"},{"id":"D","text":"has been"}]',
   'A', 'With "not only...but also," the verb agrees with the nearer subject, the plural "supporting cast members," so "were" is correct.'),

  ('The exhibit featured paintings by four regional artists ______ each contributed a piece exploring the theme of migration.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"of whom"},{"id":"B","text":", of whom"},{"id":"C","text":", whom"},{"id":"D","text":"whom"}]',
   'B', 'A comma is required before the nonrestrictive clause "of whom each contributed..." describing the four artists.'),

  (null, 'A client scheduled for surgery tells the nurse, "I signed the form, but I still do not understand what they are actually removing." What should the nurse do first?',
   '[{"id":"A","text":"Explain the surgical procedure to the client in simple terms"},{"id":"B","text":"Reassure the client that the surgeon will explain everything beforehand"},{"id":"C","text":"Notify the surgeon that the client has questions about the procedure"},{"id":"D","text":"Document that the client is anxious and continue preparing for surgery"}]',
   'C', 'Informed consent is the responsibility of the provider performing the procedure; the nurse witnesses the signature and confirms understanding. A client who does not understand has not given informed consent, so the surgeon must return. Explaining the procedure oversteps the nurse''s role, and reassurance and documentation both leave an invalid consent in place.'),

  (null, 'A registered nurse is assigning clients on a medical unit that includes a licensed practical nurse. Which client is most appropriate to assign to the LPN?',
   '[{"id":"A","text":"A client admitted one hour ago who needs an initial admission assessment"},{"id":"B","text":"A client whose plan of care needs revision after a change in condition"},{"id":"C","text":"A client receiving a first dose of intravenous antibiotic"},{"id":"D","text":"A client with stable heart failure who needs daily weights and oral medications"}]',
   'D', 'An LPN cares for stable clients with predictable outcomes. The initial admission assessment, the first dose of a medication that could cause a reaction, and revising a care plan all require RN assessment and judgment. Stable heart failure with routine weights and oral medication is exactly the predictable case an LPN manages.'),

  (null, 'During handoff, the off-going nurse reports that a client "had a rough night." Which response by the receiving nurse is most appropriate?',
   '[{"id":"A","text":"“Can you tell me specifically what happened and what was done about it?”"},{"id":"B","text":"“Thank you, I will keep an eye on them.”"},{"id":"C","text":"“I will read the notes when I get a chance.”"},{"id":"D","text":"“Did the provider come to see the client?”"}]',
   'A', 'Handoff is the highest-risk moment in a hospital stay, and a vague summary is a communication failure the receiving nurse can still repair by asking for specifics: what happened, what was done, what the response was. Accepting the vagueness, deferring to the chart, or asking a single narrow question all leave the gap in place.'),

  (null, 'A client with a head injury has a blood pressure of 178/62, a pulse of 48, and irregular respirations. What does the nurse recognize about these findings?',
   '[{"id":"A","text":"They indicate hypovolemic shock"},{"id":"B","text":"They indicate an infection"},{"id":"C","text":"They are an expected response to pain"},{"id":"D","text":"They indicate increasing intracranial pressure and require immediate provider notification"}]',
   'D', 'Widening pulse pressure, bradycardia and irregular respirations are Cushing triad, a late and ominous sign of rising intracranial pressure. Hypovolemic shock produces the reverse -- low pressure and a fast pulse -- and neither pain nor infection produces bradycardia with hypertension.'),

  (null, 'A client is admitted with suspected pulmonary tuberculosis. Which precautions should the nurse implement?',
   '[{"id":"A","text":"Airborne precautions in a negative-pressure room with an N95 respirator"},{"id":"B","text":"Droplet precautions with a surgical mask"},{"id":"C","text":"Contact precautions in a private room"},{"id":"D","text":"Standard precautions only until culture results return"}]',
   'A', 'Tuberculosis spreads on droplet nuclei small enough to stay suspended in air, which is what makes it airborne rather than droplet: it needs a negative-pressure room and a fitted N95, not a surgical mask. Precautions are started on suspicion, not on confirmation, so waiting for cultures exposes everyone in the meantime.'),

  (null, 'Which intervention is most effective for reducing the risk of falls in an older adult hospitalized client?',
   '[{"id":"A","text":"Keeping all four side rails raised at all times"},{"id":"B","text":"Applying a soft waist restraint at night"},{"id":"C","text":"Restricting the client to bed rest"},{"id":"D","text":"Ensuring the call light is within reach and the bed is in the lowest position"}]',
   'D', 'Reachable call light and a low bed reduce both the chance of an unassisted attempt and the injury if one happens. Four raised side rails are legally a restraint and increase injury when a client climbs over them; bed rest causes the deconditioning that makes the next fall likelier; and restraints are a last resort, never a first-line fall intervention.'),

  (null, 'A client in restraints requires assessment. How often should the nurse assess a client in violent or self-destructive behavioral restraints who is an adult?',
   '[{"id":"A","text":"Every 2 hours"},{"id":"B","text":"Every 30 minutes"},{"id":"C","text":"Every hour"},{"id":"D","text":"Every 15 minutes"}]',
   'D', 'Behavioral restraints for violent or self-destructive behavior carry the highest risk of injury and require the most frequent monitoring, at 15-minute intervals for an adult. Non-violent medical restraints are assessed less often, which is the distinction this question is built on -- the reason for the restraint sets the frequency, not the device.'),

  (null, 'A nurse is preparing to administer a medication and notices that the dose ordered is three times the usual adult dose. What should the nurse do?',
   '[{"id":"A","text":"Administer the dose as written since the provider ordered it"},{"id":"B","text":"Hold the medication and contact the prescriber to clarify the order"},{"id":"C","text":"Administer the usual dose instead and document the change"},{"id":"D","text":"Ask another nurse whether the dose seems reasonable and proceed if they agree"}]',
   'B', 'A nurse who recognizes a questionable order is obligated to clarify it before administering, and carrying out an order known to be unsafe transfers liability to the nurse. Changing the dose independently is prescribing, which is outside the nurse''s scope, and a colleague''s opinion does not substitute for the prescriber''s clarification.'),

  (null, 'A parent asks when an infant is typically able to sit without support. Which response by the nurse is accurate?',
   '[{"id":"A","text":"Around 2 months"},{"id":"B","text":"Around 4 months"},{"id":"C","text":"Around 12 months"},{"id":"D","text":"Around 6 to 8 months"}]',
   'D', 'Unsupported sitting typically appears between 6 and 8 months. At 2 months an infant is achieving head control, at 4 months rolling begins, and by 12 months most infants are pulling to stand and cruising -- so the earlier options describe skills that come before and the later one a skill that comes after.'),

  (null, 'A client who is 32 weeks pregnant reports a severe headache, visual changes, and swelling of the hands and face. What is the nurse''s priority action?',
   '[{"id":"A","text":"Assess blood pressure and notify the provider immediately"},{"id":"B","text":"Advise rest in a darkened room and recheck in the morning"},{"id":"C","text":"Reassure the client that headaches are common in the third trimester"},{"id":"D","text":"Recommend an over-the-counter analgesic"}]',
   'A', 'Headache, visual changes and facial edema after 20 weeks are the classic warning signs of preeclampsia, which can progress to seizure. Blood pressure is the assessment that confirms the suspicion, and the provider must be told at once. Every other option treats a warning sign as a comfort problem and sends the client home with an untreated hypertensive disorder.'),

  (null, 'When removing personal protective equipment after caring for a client on contact precautions, which item should the nurse remove first?',
   '[{"id":"A","text":"Gown"},{"id":"B","text":"Mask"},{"id":"C","text":"Gloves"},{"id":"D","text":"Eye protection"}]',
   'C', 'Gloves are removed first because they are the most contaminated item and everything else is removed with hands that have touched them otherwise. The sequence runs gloves, then eye protection, then gown, then mask, and the mask comes off last because it is removed outside the room.'),

  (null, 'A client admitted 48 hours ago after stopping heavy daily alcohol use develops tremors, tachycardia, and visual hallucinations. What should the nurse anticipate?',
   '[{"id":"A","text":"That symptoms will resolve without intervention within a few hours"},{"id":"B","text":"That the client has an underlying psychotic disorder"},{"id":"C","text":"That the client is experiencing alcohol withdrawal and requires urgent treatment"},{"id":"D","text":"That the client is seeking additional medication"}]',
   'C', 'Tremor, tachycardia and hallucinations peaking around 48 hours after the last drink is the picture of alcohol withdrawal, which can progress to seizures and delirium tremens and carries real mortality untreated. Waiting it out is dangerous, and attributing the presentation to a psychiatric diagnosis or to drug-seeking misses a medical emergency.'),

  (null, 'Which finding in an 80-year-old client should the nurse investigate rather than attribute to normal aging?',
   '[{"id":"A","text":"New confusion developing over two days"},{"id":"B","text":"Slower reaction time on a timed task"},{"id":"C","text":"Reduced skin elasticity"},{"id":"D","text":"Decreased near vision requiring reading glasses"}]',
   'A', 'Acute confusion is delirium until proved otherwise, and it is a symptom of something else -- infection, hypoxia, a medication, a metabolic derangement -- not of being 80. Slowed reaction time, reduced skin elasticity and presbyopia are all expected age-related changes. The reusable rule: normal aging is gradual, and anything that appears over hours to days is a new problem.'),

  (null, 'A client newly diagnosed with cancer says, "I do not think I can go through with this treatment." Which response by the nurse is most therapeutic?',
   '[{"id":"A","text":"“You have to do the treatment or the cancer will spread.”"},{"id":"B","text":"“Everyone feels that way at first. You will be fine.”"},{"id":"C","text":"“Tell me what worries you most about the treatment.”"},{"id":"D","text":"“Would you like me to call the chaplain?”"}]',
   'C', 'An open-ended invitation keeps the client talking and finds out what the fear actually is, which is the only route to addressing it. Warning about consequences uses fear as a lever, false reassurance dismisses the feeling, and offering a referral closes the conversation before anyone knows what is wrong.'),

  (null, 'A client receiving warfarin has an INR of 6.2. What should the nurse anticipate?',
   '[{"id":"A","text":"Holding the warfarin and preparing to administer vitamin K"},{"id":"B","text":"Increasing the warfarin dose"},{"id":"C","text":"Administering protamine sulfate"},{"id":"D","text":"No change, since this INR is therapeutic"}]',
   'A', 'Therapeutic INR for most indications is 2 to 3, so 6.2 is a serious bleeding risk. Warfarin is held and vitamin K is the reversal agent. Protamine sulfate reverses heparin, not warfarin -- pairing each anticoagulant with its own antidote is the point of the question.'),

  (null, 'A map uses a scale of 1 inch to 24 miles. Two towns are 3.5 inches apart on the map. How many miles apart are they?',
   '[{"id":"A","text":"68"},{"id":"B","text":"84"},{"id":"C","text":"72"},{"id":"D","text":"96"}]',
   'B', '3.5 times 24 is 84 miles. Choice C multiplies by 3 and D by 4.'),

  (null, 'A postoperative client rates pain as 8 out of 10 but is smiling and talking with visitors. What should the nurse do?',
   '[{"id":"A","text":"Administer the prescribed analgesic based on the client''s report"},{"id":"B","text":"Reassess the pain rating, since the client does not appear to be in pain"},{"id":"C","text":"Document that the client''s report is inconsistent with observed behavior"},{"id":"D","text":"Offer a non-pharmacological measure instead"}]',
   'A', 'Pain is whatever the client says it is. Behavior is an unreliable indicator -- people distract themselves, mask discomfort in front of visitors, and adapt to chronic pain -- so treating the report is correct. Each other option substitutes the nurse''s observation for the client''s report, which is the definition of undertreating pain.'),

  (null, 'An older adult client reports difficulty sleeping in the hospital. Which nursing intervention should the nurse implement first?',
   '[{"id":"A","text":"Cluster nursing care to reduce nighttime interruptions"},{"id":"B","text":"Request a prescription for a sedative-hypnotic"},{"id":"C","text":"Encourage a daytime nap to make up the lost sleep"},{"id":"D","text":"Offer caffeinated tea in the evening for comfort"}]',
   'A', 'Non-pharmacological measures come first, and in a hospital the biggest single cause of broken sleep is being woken by staff. Sedative-hypnotics in older adults raise the risk of falls, delirium and next-day sedation; daytime napping reduces night-time sleep drive; and caffeine in the evening works against the goal.'),

  (null, 'A client with an indwelling urinary catheter has no urine output for the past two hours. What should the nurse do first?',
   '[{"id":"A","text":"Check the tubing for kinks and ensure the bag is below bladder level"},{"id":"B","text":"Irrigate the catheter with sterile saline"},{"id":"C","text":"Notify the provider that the client is anuric"},{"id":"D","text":"Remove the catheter and reinsert a new one"}]',
   'A', 'Assess before intervening. A kinked tube or a bag hung above the bladder is the commonest and most easily fixed cause of an apparently dry catheter, and it takes seconds to rule out. Irrigating, reinserting or reporting anuria all act on a conclusion that has not been reached yet.'),

  (null, 'A client is receiving continuous enteral tube feeding. Which nursing action best reduces the risk of aspiration?',
   '[{"id":"A","text":"Warming the formula before administration"},{"id":"B","text":"Flushing the tube with 30 mL of water every 8 hours"},{"id":"C","text":"Keeping the head of the bed elevated at least 30 degrees"},{"id":"D","text":"Changing the feeding bag every 48 hours"}]',
   'C', 'Elevating the head of the bed uses gravity to keep formula in the stomach and is the single most effective aspiration precaution during tube feeding. Flushing maintains patency, warming improves comfort, and bag changes control infection -- all worth doing, and none of them about aspiration.'),

  (null, 'A provider prescribes 750 mg of an antibiotic. The pharmacy supplies a vial containing 250 mg per 5 mL. How many milliliters should the nurse administer?',
   'null',
   '15', 'Set up the proportion 250 mg / 5 mL = 750 mg / x. Cross-multiplying gives 250x = 3750, so x = 15 mL. Checking the direction: the ordered dose is three times what is in 5 mL, so the volume must be three times 5 mL.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;


update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  (null, 'A client weighing 70 kg is prescribed a medication at 0.5 mg per kg per dose. The medication is supplied as 10 mg per mL. How many milliliters should the nurse administer per dose?',
   'null',
   '3.5', 'The dose is 0.5 mg/kg times 70 kg, which is 35 mg. At 10 mg per mL, 35 mg is 3.5 mL. Dividing the weight by the concentration first is the usual error and gives an answer with no meaningful units.'),

  (null, 'A client receiving intravenous vancomycin develops flushing of the face and neck during infusion. What should the nurse do first?',
   '[{"id":"A","text":"Stop the infusion and prepare to administer epinephrine"},{"id":"B","text":"Continue the infusion and document the finding"},{"id":"C","text":"Slow the infusion rate and notify the provider"},{"id":"D","text":"Administer the remaining dose as a rapid bolus"}]',
   'C', 'Flushing during vancomycin infusion is an infusion-rate reaction caused by histamine release rather than a true allergy, and slowing the rate is the correct first response. Epinephrine is for anaphylaxis, which this is not; continuing unchanged lets it worsen; and a rapid bolus is exactly what causes it.'),

  (null, 'A train travels 180 kilometres at a constant speed. If its speed had been 15 kilometres per hour faster, the journey would have taken 1 hour less. What was the train''s actual speed, in kilometres per hour?',
   'null',
   '45', 'Let the speed be s. Then 180/s - 180/(s + 15) = 1. Multiplying through by s(s + 15) gives 180(s + 15) - 180s = s(s + 15), so 2700 = s squared + 15s. Solving s squared + 15s - 2700 = 0 factors as (s + 60)(s - 45) = 0, and speed cannot be negative, so s = 45.'),

  (null, 'A client who had abdominal surgery two days ago reports sudden shortness of breath and pleuritic chest pain. What should the nurse suspect?',
   '[{"id":"A","text":"Wound dehiscence"},{"id":"B","text":"Pulmonary embolism"},{"id":"C","text":"Paralytic ileus"},{"id":"D","text":"Urinary retention"}]',
   'B', 'Sudden dyspnea with pleuritic chest pain in a postoperative, relatively immobile client is pulmonary embolism until proved otherwise. Dehiscence presents as a wound separating, ileus as absent bowel sounds and distension, and retention as a distended bladder -- none of them produce this respiratory picture.'),

  (null, 'A client is scheduled for a contrast-enhanced computed tomography scan. Which finding should the nurse report to the provider before the procedure?',
   '[{"id":"A","text":"A reported allergy to latex"},{"id":"B","text":"A blood pressure of 128 over 76"},{"id":"C","text":"A serum creatinine of 2.4 mg/dL"},{"id":"D","text":"A history of appendectomy"}]',
   'C', 'Iodinated contrast is nephrotoxic, and an elevated creatinine signals impaired kidney function that makes contrast-induced nephropathy far likelier. The blood pressure is normal, latex allergy matters for gloves and equipment rather than for contrast, and a past appendectomy has no bearing on the scan.'),

  (null, 'Which laboratory result should the nurse report to the provider immediately for a client receiving heparin?',
   '[{"id":"A","text":"White blood cell count of 8,000 per microliter"},{"id":"B","text":"Hemoglobin of 13.5 g/dL"},{"id":"C","text":"Platelet count of 68,000 per microliter"},{"id":"D","text":"Sodium of 138 mEq/L"}]',
   'C', 'A falling platelet count in a client on heparin raises the possibility of heparin-induced thrombocytopenia, which paradoxically causes clotting rather than bleeding and requires the heparin to be stopped. The other three values are all within normal limits and would not be reported as abnormal at all.'),

  (null, 'A client has a chest tube connected to a water-seal drainage system. The nurse observes continuous vigorous bubbling in the water-seal chamber. What does this most likely indicate?',
   '[{"id":"A","text":"Normal functioning of the system"},{"id":"B","text":"Obstruction of the chest tube"},{"id":"C","text":"Complete lung re-expansion"},{"id":"D","text":"An air leak in the system"}]',
   'D', 'Intermittent bubbling in the water-seal chamber with respiration is expected; continuous vigorous bubbling means air is entering the system from somewhere it should not, and the nurse traces the tubing for a leak. Full re-expansion produces the opposite finding -- bubbling and tidaling stop -- and an obstruction produces no bubbling at all.'),

  (null, 'A client is scheduled for a bronchoscopy. Which nursing action is essential after the procedure?',
   '[{"id":"A","text":"Offer fluids as soon as the client is awake"},{"id":"B","text":"Ambulate the client immediately to prevent atelectasis"},{"id":"C","text":"Withhold food and fluids until the gag reflex returns"},{"id":"D","text":"Position the client flat on the back"}]',
   'C', 'The topical anesthetic used for bronchoscopy suppresses the gag reflex, so anything swallowed before it returns can be aspirated. Fluids are withheld until the reflex is confirmed. Immediate ambulation is unnecessary, and lying flat after airway instrumentation works against airway protection.'),

  ('The observatory, which sits at the highest point in the county ______ attracts astronomers from three neighboring states.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"county attracts"},{"id":"B","text":"county; attracts"},{"id":"C","text":"county: attracts"},{"id":"D","text":"county, attracts"}]',
   'D', 'The clause "which sits at the highest point in the county" is nonessential and already opens with a comma, so it must close with one. A semicolon or colon would need an independent clause after it, and omitting the punctuation leaves the interrupting clause unclosed.'),

  ('Neither of the two candidates had finished ______ closing statement when the moderator called time.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"his or her"},{"id":"B","text":"their"},{"id":"C","text":"its"},{"id":"D","text":"they''re"}]',
   'A', '"Neither" is singular, so it takes a singular pronoun, and the candidates are people rather than things. "Their" is plural, "its" is for things, and "they''re" is a contraction of "they are".'),

  ('By the time the archivists opened the crate, the letters inside ______ untouched for nearly a century.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"sit"},{"id":"B","text":"have sat"},{"id":"C","text":"will have sat"},{"id":"D","text":"had sat"}]',
   'D', 'The letters sat before the archivists opened the crate, and both events are in the past, so the earlier one takes the past perfect. The present perfect in B would connect the sitting to now rather than to the opening.'),

  ('Rusted through and missing two rungs, ______', 'Which choice completes the sentence so that the modifier is not dangling?',
   '[{"id":"A","text":"the inspector condemned the fire escape."},{"id":"B","text":"it was necessary to condemn the fire escape."},{"id":"C","text":"condemning the fire escape was necessary."},{"id":"D","text":"the fire escape was condemned by the inspector."}]',
   'D', 'The opening phrase describes the fire escape, so the fire escape must be the subject that follows. In A the inspector is rusted through; in C and D the subject is an abstraction, which the phrase cannot describe.'),

  ('The collection of fossils donated by the retired geologist ______ now the centerpiece of the museum''s new wing.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"are"},{"id":"B","text":"have been"},{"id":"C","text":"were"},{"id":"D","text":"is"}]',
   'D', 'The subject is "collection", which is singular; "of fossils" is a prepositional phrase and cannot govern the verb. Every plural option agrees with "fossils" rather than with the actual subject.'),

  (null, 'In a right triangle, one leg measures 8 and the hypotenuse measures 17. What is the area of the triangle?',
   '[{"id":"A","text":"60"},{"id":"B","text":"30"},{"id":"C","text":"68"},{"id":"D","text":"120"},{"id":"E","text":"136"}]',
   'A', 'The other leg is the square root of 17 squared minus 8 squared, which is the square root of 289 - 64 = 225, so 15. The area is half the product of the legs: (1/2)(8)(15) = 60. Choice D forgets the half, and choice C multiplies the given leg by the hypotenuse.'),

  ('A writer is arranging four sentences: (1) The results surprised even the researchers who designed the trial. (2) Volunteers walked for twenty minutes after each meal. (3) A recent study tested a very simple intervention. (4) Average post-meal blood sugar fell by nearly a fifth.', 'Which order produces the most logical paragraph?',
   '[{"id":"A","text":"2, 3, 1, 4"},{"id":"B","text":"1, 3, 2, 4"},{"id":"C","text":"3, 2, 4, 1"},{"id":"D","text":"4, 1, 2, 3"}]',
   'C', 'The paragraph must introduce the study, describe what was done, report the result, then comment on it. Sentence 1 comments on results and so cannot come before them, which eliminates B and D; sentence 2 cannot open, since "Volunteers" has no antecedent yet.'),

  ('A writer wants to end an essay about restoring a salt marsh by emphasizing that the work is not finished.', 'Which choice best accomplishes that goal?',
   '[{"id":"A","text":"Three of the seven original channels now flow freely; the other four are still choked with fill."},{"id":"B","text":"The marsh today is a remarkable sight, and the volunteers deserve every bit of the credit."},{"id":"C","text":"Restoration projects like this one have been attempted in nine states."},{"id":"D","text":"The first shovel went into the ground on a cold morning in March."}]',
   'A', 'Only A names what remains undone, and does so with a specific figure. A closes on praise, C widens to other states, and D returns to the beginning of the project.'),

  ('The recipe calls for three ingredients the cook did not have ______ saffron, buttermilk, and a preserved lemon.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"have, saffron"},{"id":"B","text":"have; saffron"},{"id":"C","text":"have: saffron"},{"id":"D","text":"have saffron"}]',
   'C', 'A colon introduces a list that specifies what the preceding independent clause referred to. A semicolon requires an independent clause after it, and a bare comma before a three-item list of this kind leaves the list unintroduced.'),

  ('The mechanic explained that the noise was harmless ______ a loose heat shield rattling against the exhaust.', 'Which choice makes the sentence conform to the conventions of Standard English?',
   '[{"id":"A","text":"harmless and a loose"},{"id":"B","text":"harmless. A loose"},{"id":"C","text":"harmless; a loose"},{"id":"D","text":"harmless, a loose"}]',
   'D', 'The phrase after the blank renames "the noise" and is not an independent clause, so a comma is correct. A period or semicolon would leave a fragment standing alone, and "and" would suggest a second, separate thing.'),

  ('At this point in time, the museum is currently closed for renovations.', 'Which revision is most concise while keeping the meaning?',
   '[{"id":"A","text":"At this point in time, the museum is closed for renovations."},{"id":"B","text":"The museum is closed for renovations."},{"id":"C","text":"The museum is currently closed for renovations at this time."},{"id":"D","text":"Currently, at this point, the museum is closed for renovations."}]',
   'B', '"At this point in time" and "currently" say the same thing, and the present tense already says it a third time. Only C removes all of the redundancy.'),

  (null, 'A right triangle has legs of length 9 and 12. What is the length of its hypotenuse?',
   '[{"id":"A","text":"15"},{"id":"B","text":"13"},{"id":"C","text":"21"},{"id":"D","text":"25"}]',
   'A', '81 + 144 = 225, and the square root of 225 is 15. Choice C adds the legs instead of using the Pythagorean theorem.'),

  (null, 'A jacket is marked down from $80 to $68. By what percent was the price reduced?',
   '[{"id":"A","text":"12%"},{"id":"B","text":"17.6%"},{"id":"C","text":"15%"},{"id":"D","text":"20%"}]',
   'C', 'The reduction is $12, and 12/80 = 0.15, so 15 percent. Choice A is the dollar amount mistaken for a percent, and B divides by the new price instead of the original.'),

  (null, 'If 5x - 3 = 2x + 12, what is the value of x?',
   '[{"id":"A","text":"3"},{"id":"B","text":"9"},{"id":"C","text":"7"},{"id":"D","text":"5"}]',
   'D', 'Subtracting 2x from both sides gives 3x - 3 = 12, so 3x = 15 and x = 5.'),

  (null, 'A printer produces 14 pages per minute. How many minutes does it take to print 385 pages?',
   '[{"id":"A","text":"22.5"},{"id":"B","text":"27.5"},{"id":"C","text":"25"},{"id":"D","text":"32"}]',
   'B', 'Time equals total pages divided by the rate: 385 / 14 = 27.5 minutes. Multiplying instead of dividing gives a number in the thousands, and the units are the check -- pages divided by pages-per-minute leaves minutes.'),

  (null, 'A bag holds 4 red, 6 blue, and 5 green marbles. One marble is drawn and not replaced, and it is blue. What is the probability the next marble drawn is also blue?',
   '[{"id":"A","text":"6/15"},{"id":"B","text":"6/14"},{"id":"C","text":"5/14"},{"id":"D","text":"5/15"}]',
   'C', 'After one blue is removed there are 5 blue marbles among 14 remaining. Choice B forgets to reduce the blue count, and A ignores the removal entirely.'),

  (null, 'If f(x) = 3x^2 - 2x + 1, what is f(-2)?',
   '[{"id":"A","text":"9"},{"id":"B","text":"11"},{"id":"C","text":"-15"},{"id":"D","text":"17"}]',
   'D', '3(-2)^2 = 12, then -2(-2) = +4, plus 1 gives 17. Choice C comes from squaring after multiplying, treating 3(-2)^2 as (3 times -2)^2 with the wrong sign handling.'),

  (null, 'The system 2x + 3y = 31 and x - y = 3 has exactly one solution. What is the value of y?',
   'null',
   '5', 'From the second equation x = y + 3. Substituting gives 2(y + 3) + 3y = 31, so 5y + 6 = 31, 5y = 25, and y = 5.'),

  (null, 'A student has scores of 82, 91, and 78 on three tests. What score on a fourth test would make the average of all four exactly 85?',
   'null',
   '89', 'A mean of 85 across four tests requires a total of 340. The first three total 251, so the fourth must be 89.'),

  (null, 'The function g is defined by g(x) = 2(x - 4)^2 + 7. What is the minimum value of g?',
   '[{"id":"A","text":"-4"},{"id":"B","text":"4"},{"id":"C","text":"15"},{"id":"D","text":"7"}]',
   'D', 'A squared term is never negative, so the smallest value of 2(x - 4)^2 is 0, reached at x = 4, leaving g = 7. Choice B reports the x value at which the minimum occurs rather than the minimum itself.'),

  ('For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.', 'The passage is primarily concerned with:',
   '[{"id":"A","text":"the varieties of plants best suited to a difficult climate"},{"id":"B","text":"the practical advantages of keeping written records in any hobby"},{"id":"C","text":"the narrator''s regret at never having learned to garden"},{"id":"D","text":"the narrator''s grandmother''s methodical documentation of her gardening, including its failures"}]',
   'D', 'The passage describes the ledger, its columns, and the narrator''s reaction to the record of failure. It names no plant varieties, expresses no regret about the narrator''s own gardening, and generalizes to no other hobby.'),

  ('For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.', 'It can reasonably be inferred from the passage that the grandmother considered a failed planting to be:',
   '[{"id":"A","text":"a reason to abandon that corner of the garden"},{"id":"B","text":"an embarrassment best left unrecorded"},{"id":"C","text":"information worth keeping"},{"id":"D","text":"proof that her methods were unsound"}]',
   'C', 'She recorded failures as carefully as successes and gardened "by evidence", which treats a failure as data. Nothing suggests she abandoned ground, hid results, or doubted her approach.'),

  ('Sourdough is not a recipe so much as a relationship. The starter is a living culture of wild yeast and lactic acid bacteria, and it eats on a schedule: fed too little, it sours and weakens; fed too much, it never develops flavor. Bakers speak of a starter''s "mood" and they are not being whimsical. A culture kept at 24 degrees Celsius behaves measurably differently from the same culture kept at 18, and the bread records the difference.', 'According to the passage, a starter that is fed too much will:',
   '[{"id":"A","text":"sour and weaken"},{"id":"B","text":"change temperature"},{"id":"C","text":"fail to develop flavor"},{"id":"D","text":"stop rising entirely"}]',
   'C', 'The passage pairs each error with its consequence: too little food sours and weakens it, too much leaves it without flavor. The other options either swap the two or state something the passage does not.'),

  ('The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.', 'The main point of the passage is that the blue whale''s heart is remarkable for:',
   '[{"id":"A","text":"the range of rates at which it can operate"},{"id":"B","text":"its size alone"},{"id":"C","text":"how difficult it was to monitor"},{"id":"D","text":"how closely it resembles other mammalian hearts"}]',
   'A', 'The passage sets up size as "the whole story" only to replace it: the finding is the span from 37 beats a minute to 2. The difficulty of monitoring is background, and the closing sentence says the opposite of D.'),

  ('The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.', 'The sentence "Not slow -- 2." primarily serves to:',
   '[{"id":"A","text":"insist that the reader register how extreme the figure is"},{"id":"B","text":"correct an error in the preceding sentence"},{"id":"C","text":"introduce a measurement taken at a different depth"},{"id":"D","text":"concede that the monitoring may have been inaccurate"}]',
   'A', 'The fragment repeats the number rather than adding information, which is a way of refusing to let the reader skim past it. It corrects nothing, adds no new measurement and concedes nothing.'),

  ('The blue whale''s heart is the size of a small car, and for a long time that fact was the whole story: enormous animal, enormous organ. Then researchers managed to attach a heart-rate monitor to a wild blue whale and found something nobody had predicted. At the surface its heart beat about 37 times a minute. On a deep dive it fell to 2. Not slow -- 2. The organ is not merely large; it operates across a range no other mammalian heart approaches.', 'Which detail from the passage most directly supports the claim in the final sentence?',
   '[{"id":"A","text":"The heart is the size of a small car."},{"id":"B","text":"Researchers attached a monitor to a wild blue whale."},{"id":"C","text":"The finding was not predicted."},{"id":"D","text":"The rate falls from about 37 at the surface to 2 on a deep dive."}]',
   'D', 'The final sentence claims an unmatched operating range, and only the pair of rates establishes a range. Size supports the claim the sentence is arguing against, and the other two details describe the study rather than its result.'),

  (null, 'If 3x + 7 = 22, what is the value of x?',
   '[{"id":"A","text":"3"},{"id":"B","text":"7"},{"id":"C","text":"5"},{"id":"D","text":"9"}]',
   'C', 'Undo the operations in reverse order: subtract 7 from both sides to get 3x = 15, then divide both sides by 3 to get x = 5. The commonest slip is dividing before subtracting, which gives x + 7/3 = 22/3 and leads nowhere useful.'),

  ('Students measured how long a 50 mL sample of water took to reach 80 degrees Celsius on a hot plate at four power settings.

Setting | Power (W) | Time to 80 C (s)
1       | 250       | 412
2       | 500       | 196
3       | 750       | 141
4       | 1000      | 103', 'Based on the table, as power setting increases, the time to reach 80 degrees Celsius:',
   '[{"id":"A","text":"decreases only"},{"id":"B","text":"increases only"},{"id":"C","text":"increases, then decreases"},{"id":"D","text":"remains constant"}]',
   'A', 'The times fall from 412 to 196 to 141 to 103 seconds, decreasing at every step.'),

  ('Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7', 'According to Experiment 1, which lamp color produced the shortest seedlings?',
   '[{"id":"A","text":"Red"},{"id":"B","text":"Green"},{"id":"C","text":"Blue"},{"id":"D","text":"White"}]',
   'B', 'Green produced a mean height of 6.8 cm, lower than every other color.'),

  ('Students measured how long a 50 mL sample of water took to reach 80 degrees Celsius on a hot plate at four power settings.

Setting | Power (W) | Time to 80 C (s)
1       | 250       | 412
2       | 500       | 196
3       | 750       | 141
4       | 1000      | 103', 'A student claims that doubling the power always halves the heating time exactly. The data most strongly support which evaluation of that claim?',
   '[{"id":"A","text":"Supported, because 500 W took less than half the time of 250 W"},{"id":"B","text":"Supported, because time decreases whenever power increases"},{"id":"C","text":"Not supported, because 500 W took slightly less than half the time of 250 W and 1000 W took slightly more than half the time of 500 W"},{"id":"D","text":"Not supported, because time increased at one of the settings"}]',
   'C', 'Half of 412 is 206 and the measured value is 196, so the first doubling beat the prediction; half of 196 is 98 and the measured value at 1000 W is 103, so the second doubling missed it. The relationship is close to inverse but not exact. Time never increased, which rules out D, and mere direction is not the claim, which rules out C.'),

  ('A chemist measured the solubility of a salt in water at several temperatures.

Temperature (C) | Solubility (g per 100 mL)
10              | 21
20              | 32
30              | 46
40              | 63
50              | 84', 'Based on the table, solubility at 25 degrees Celsius would most likely be closest to:',
   '[{"id":"A","text":"26 g per 100 mL"},{"id":"B","text":"46 g per 100 mL"},{"id":"C","text":"39 g per 100 mL"},{"id":"D","text":"55 g per 100 mL"}]',
   'C', '25 C lies between 20 C and 30 C, so solubility lies between 32 and 46 g per 100 mL. Only 39 falls in that interval.'),

  ('A student tested whether a commercial rust inhibitor slows corrosion. Ten identical iron nails were coated with inhibitor and left in salt water; ten uncoated nails were left in fresh water. After two weeks the coated nails showed less rust.', 'The student''s conclusion that the inhibitor slows corrosion is weakened primarily because:',
   '[{"id":"A","text":"the two groups differed in the water used as well as in the coating"},{"id":"B","text":"only ten nails were used in each group"},{"id":"C","text":"two weeks is not long enough for iron to rust"},{"id":"D","text":"rust was assessed by appearance rather than by mass"}]',
   'A', 'Two variables changed at once, and salt water is the more corrosive of the two -- so the coated nails rusted less despite the harsher condition, which the design cannot separate from the coating. Sample size and measurement method are secondary, and iron visibly rusts well within two weeks.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;


update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  ('Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7', 'A researcher hypothesizes that chlorophyll absorbs green light poorly. Which result from Experiment 1 is most consistent with that hypothesis?',
   '[{"id":"A","text":"Blue produced the tallest seedlings."},{"id":"B","text":"All four groups grew for the same 21 days."},{"id":"C","text":"Red and white produced similar heights."},{"id":"D","text":"Green produced seedlings roughly half the height of those under white light."}]',
   'D', 'Poor absorption of green light means less usable energy and therefore less growth, which is exactly the deficit the green group shows against the white control. A is consistent with strong blue absorption but does not bear on green, and C and D say nothing about green at all.'),

  ('A buffer is prepared containing 0.10 M of a weak acid HA and 0.10 M of its conjugate base A-. The acid has a pKa of 4.8.', 'What is the pH of the buffer before any base is added?',
   '[{"id":"A","text":"1.0"},{"id":"B","text":"7.0"},{"id":"C","text":"4.8"},{"id":"D","text":"9.2"}]',
   'C', 'The Henderson-Hasselbalch equation gives pH = pKa + log([A-]/[HA]). With equal concentrations the ratio is 1, its logarithm is 0, and the pH equals the pKa exactly. This is the single most useful fact about buffers: at the half-equivalence point, pH and pKa are the same number.'),

  ('A buffer is prepared containing 0.10 M of a weak acid HA and 0.10 M of its conjugate base A-. The acid has a pKa of 4.8. A small volume of strong base is then added.', 'What happens to the pH of the solution immediately after the strong base is added?',
   '[{"id":"A","text":"It falls sharply, because the base consumes A-"},{"id":"B","text":"It does not change at all, because buffers hold pH exactly constant"},{"id":"C","text":"It rises sharply, because the buffer has no capacity at equal concentrations"},{"id":"D","text":"It rises slightly, because HA neutralises most of the added base"}]',
   'D', 'Added strong base is consumed by the weak acid HA, converting some of it to A-. That shifts the ratio of base to acid slightly upward, so the pH rises slightly rather than sharply. Buffer capacity is at its maximum when the two are equal, which is the opposite of choice C, and no buffer holds pH exactly constant -- it resists change rather than preventing it.'),

  ('Researchers measured the rate of an enzyme-catalyzed reaction at several temperatures. Rate rose steadily from 20 to 40 degrees Celsius, peaked near 42 degrees, then fell sharply, reaching almost zero by 60 degrees. A parallel run with the same reactants and no enzyme showed rate rising steadily across the entire range.', 'Compared with the uncatalysed reaction at 30 degrees Celsius, the catalyzed reaction has:',
   '[{"id":"A","text":"the same activation energy and a more negative free energy change"},{"id":"B","text":"a lower activation energy and a more negative free energy change"},{"id":"C","text":"a lower activation energy and the same overall free energy change"},{"id":"D","text":"a higher activation energy and the same free energy change"}]',
   'C', 'A catalyst lowers the activation barrier and is unchanged at the end, so it alters the path and not the endpoints. The free energy change is a state function fixed by the reactants and products, which is why a catalyst can never make an unfavourable reaction favourable -- only faster.'),

  (null, 'A client is admitted with a temperature of 39.2 degrees Celsius, a heart rate of 122, a blood pressure of 84/48, and a lactate of 4.2 mmol/L. What does the nurse recognize?',
   '[{"id":"A","text":"Septic shock"},{"id":"B","text":"Cardiogenic shock"},{"id":"C","text":"Neurogenic shock"},{"id":"D","text":"Anaphylactic shock"}]',
   'A', 'Fever, tachycardia, hypotension and a raised lactate together are septic shock -- the lactate is the marker of tissue hypoperfusion that separates sepsis from an ordinary febrile illness. Cardiogenic shock follows pump failure rather than infection, neurogenic shock presents with bradycardia rather than tachycardia, and anaphylaxis follows an exposure and brings airway and skin findings.'),

  (null, 'A client receiving intravenous fluids develops crackles in the lung bases, jugular venous distension, and a bounding pulse. What should the nurse do first?',
   '[{"id":"A","text":"Increase the infusion rate to improve perfusion"},{"id":"B","text":"Administer an additional fluid bolus"},{"id":"C","text":"Place the client flat to improve venous return"},{"id":"D","text":"Slow or stop the infusion and elevate the head of the bed"}]',
   'D', 'Crackles, jugular venous distension and a bounding pulse are fluid volume overload, so the first action is to stop adding fluid and to sit the client up to ease the work of breathing. Every other option adds volume or worsens the pulmonary congestion.'),

  ('A cell culture is treated with a compound that makes the inner mitochondrial membrane freely permeable to protons. Oxygen consumption rises, but ATP production falls sharply.', 'Which explanation best accounts for this result?',
   '[{"id":"A","text":"The electron transport chain is inhibited, so less oxygen is used"},{"id":"B","text":"ATP synthase is running in reverse, hydrolysing ATP to pump protons"},{"id":"C","text":"Glycolysis is inhibited, so no substrate reaches the mitochondrion"},{"id":"D","text":"The proton gradient is dissipated, so ATP synthase cannot use it, while electron transport runs unopposed"}]',
   'D', 'This is an uncoupler. Electron transport builds a proton gradient and ATP synthase spends it; making the membrane leaky removes the gradient, so ATP synthesis fails while the chain runs faster than ever with nothing backing it up -- which is why oxygen consumption rises. Choice A contradicts the rise in oxygen use, and the energy released appears as heat.'),

  ('An enzyme was assayed at a range of substrate concentrations, with and without an added compound X. Without X, the apparent Km was 4 micromolar and Vmax was 100 units. With X present, the apparent Km rose to 12 micromolar while Vmax remained 100 units.', 'Which experimental change would most directly test the proposed mechanism of compound X?',
   '[{"id":"A","text":"Measuring the molecular weight of compound X"},{"id":"B","text":"Repeating the assay at a lower enzyme concentration"},{"id":"C","text":"Repeating the assay at a much higher substrate concentration"},{"id":"D","text":"Repeating the assay at a lower temperature"}]',
   'C', 'The claim is that X competes for the active site, and the definitive prediction of that claim is that enough substrate should outcompete it and restore the uninhibited rate. Lowering enzyme concentration scales everything down without discriminating between mechanisms, and neither molecular weight nor temperature tests where X binds.'),

  ('In an electrochemical cell, zinc metal is oxidised at one electrode and copper ions are reduced at the other, producing a measurable voltage.', 'At which electrode does oxidation occur, and what happens to the mass of that electrode over time?',
   '[{"id":"A","text":"The anode; its mass decreases"},{"id":"B","text":"The cathode; its mass decreases"},{"id":"C","text":"The anode; its mass increases"},{"id":"D","text":"The cathode; its mass increases"}]',
   'A', 'Oxidation always occurs at the anode -- the two words share a vowel, which is the standard mnemonic. Zinc atoms lose electrons and leave the electrode as ions in solution, so the zinc electrode loses mass while the copper cathode gains it as copper ions plate out.'),

  (null, 'A cell is placed in a solution with a lower solute concentration than its cytoplasm. What happens?',
   '[{"id":"A","text":"Water enters the cell and it swells"},{"id":"B","text":"Water leaves the cell and it shrinks"},{"id":"C","text":"Solute enters the cell down its gradient until concentrations equalise"},{"id":"D","text":"Nothing, because the membrane is impermeable to water"}]',
   'A', 'Water moves toward the higher solute concentration, which here is inside, so the cell takes up water and swells -- the solution is hypotonic to the cell. Choice C describes what would happen if the membrane were freely permeable to the solute, which is usually the point of the question, and aquaporins make choice D false for essentially every cell.'),

  ('A survey finds that neighborhoods with more parks report better self-rated health. The researchers conclude that building parks improves health.', 'Which is the strongest objection to that conclusion?',
   '[{"id":"A","text":"Wealthier neighborhoods may have both more parks and better health for other reasons"},{"id":"B","text":"The sample size was too small to detect an effect"},{"id":"C","text":"Self-rated health is not a valid construct"},{"id":"D","text":"Parks are not the only kind of green space"}]',
   'A', 'The study is observational, so the association could be produced entirely by a third variable that causes both -- income being the obvious candidate. That is confounding, and it is the objection that undermines the causal claim rather than merely qualifying it. Sample size affects precision, not causal direction, and the other two narrow the finding without challenging its logic.'),

  (null, 'The smallest difference between two stimuli that a person can reliably detect is called the:',
   '[{"id":"A","text":"absolute threshold"},{"id":"B","text":"sensory adaptation point"},{"id":"C","text":"just-noticeable difference"},{"id":"D","text":"signal detection criterion"}]',
   'C', 'The just-noticeable difference is the smallest detectable change between two stimuli, while the absolute threshold is the smallest detectable stimulus in the first place. Sensory adaptation is a decline in response to a constant stimulus, and the detection criterion is how willing an observer is to say they noticed something.'),

  ('For most of its history the word "amateur" carried no insult. It named someone who did a thing for love of it, and it was used approvingly of the naturalists, astronomers and archaeologists who did much of the observing that professionals later systematised. The shift came with the professions themselves, which needed a word for everyone outside them, and found one ready to hand. What changed was not the amateurs. It was who got to define competence.', 'The passage suggests that the word "amateur" acquired its negative sense primarily because:',
   '[{"id":"A","text":"amateurs began producing lower-quality work"},{"id":"B","text":"the activities themselves became more technically demanding"},{"id":"C","text":"professional groups needed a term for those outside them"},{"id":"D","text":"the word was mistranslated from its original language"}]',
   'C', 'The passage says the shift came with the professions, which "needed a word for everyone outside them", and then states directly that what changed was not the amateurs. Choices A and C both locate the change in the amateurs or the work, which the final two sentences rule out.'),

  ('For most of its history the word "amateur" carried no insult. It named someone who did a thing for love of it, and it was used approvingly of the naturalists, astronomers and archaeologists who did much of the observing that professionals later systematised. The shift came with the professions themselves, which needed a word for everyone outside them, and found one ready to hand. What changed was not the amateurs. It was who got to define competence.', 'The examples of naturalists, astronomers and archaeologists function primarily to:',
   '[{"id":"A","text":"show that professional standards were low at the time"},{"id":"B","text":"argue that these three fields were unusually welcoming to outsiders"},{"id":"C","text":"contrast scientific amateurs with artistic ones"},{"id":"D","text":"establish that the word once described people doing serious work"}]',
   'D', 'The list supports the claim in the first sentence by naming amateurs whose work professionals later built on, which is what makes the later insult worth remarking on. It draws no contrast between fields, mentions no artistic amateurs, and says nothing about professional standards.'),

  ('Restoration is usually described as returning a building to how it looked at some earlier moment. But every building has had many moments, and choosing one is an argument rather than a discovery. The restorer who strips a Victorian church back to its medieval fabric has not uncovered the true building; they have decided that six centuries of use were an interruption. That decision may be defensible. What it is not is neutral, and the language of restoration -- returning, uncovering, revealing -- works hard to make it sound as though no decision was made at all.', 'The main idea of the passage is that restoration:',
   '[{"id":"A","text":"should generally be avoided in favour of preservation"},{"id":"B","text":"has improved as techniques have become more precise"},{"id":"C","text":"is impossible to carry out accurately on medieval buildings"},{"id":"D","text":"involves a choice that its own vocabulary tends to conceal"}]',
   'D', 'The passage argues that picking which moment to restore to is an argument, and that words like "uncovering" disguise it as a discovery. It explicitly allows that the decision "may be defensible", so it is not arguing against restoration -- which rules out A -- and it makes no claim about accuracy or about improvement over time.'),

  ('A company reports the following quarterly revenue, in millions of dollars:

Q1: 12
Q2: 15
Q3: 15
Q4: 18', 'By what percent did revenue grow from Q1 to Q4?',
   '[{"id":"A","text":"6 percent"},{"id":"B","text":"33 percent"},{"id":"C","text":"60 percent"},{"id":"D","text":"50 percent"},{"id":"E","text":"150 percent"}]',
   'D', 'The increase is 18 - 12 = 6, and percent change is the increase over the ORIGINAL value: 6/12 = 0.5, or 50 percent. Choice B divides by the final value instead, and choice E reports the ratio of final to original rather than the change.'),

  ('Far from being the ______ figure of legend, the explorer emerges from these letters as anxious, indecisive, and frequently homesick.', 'Select the word that best completes the text.',
   '[{"id":"A","text":"itinerant"},{"id":"B","text":"obscure"},{"id":"C","text":"prolific"},{"id":"D","text":"reticent"},{"id":"E","text":"intrepid"}]',
   'E', '"Far from being" signals that the blank is the opposite of what follows, and what follows is anxious and indecisive. "Intrepid" means fearless, which is the opposite required. "Obscure" and "reticent" are closer to the letters than against them, and neither "prolific" nor "itinerant" contrasts with anxiety.'),

  (null, 'If 2^(x+3) = 32, what is the value of x?',
   '[{"id":"A","text":"1"},{"id":"B","text":"3"},{"id":"C","text":"2"},{"id":"D","text":"5"},{"id":"E","text":"8"}]',
   'C', 'Write 32 as a power of the same base: 32 = 2^5. With equal bases the exponents must be equal, so x + 3 = 5 and x = 2. Choice D is the exponent on the right-hand side, taken without subtracting the 3.'),

  (null, 'A price is increased by 20 percent and then decreased by 20 percent. Compared with the original price, the final price is:',
   '[{"id":"A","text":"the same"},{"id":"B","text":"20 percent lower"},{"id":"C","text":"4 percent higher"},{"id":"D","text":"4 percent lower"},{"id":"E","text":"40 percent lower"}]',
   'D', 'The second percentage is taken of a larger number than the first, so the two do not cancel. Starting from 100: a 20 percent rise gives 120, and a 20 percent fall from 120 removes 24, leaving 96 -- 4 percent below the original. The general result is that successive equal rises and falls always end below where they started.'),

  ('A data set contains the values 4, 7, 7, 9, and 23.', 'Which statement about this data set is true?',
   '[{"id":"A","text":"The mean is less than the median"},{"id":"B","text":"The range is less than the mean"},{"id":"C","text":"The mean equals the median"},{"id":"D","text":"The mode is greater than the mean"},{"id":"E","text":"The mean is greater than the median"}]',
   'E', 'The median is the middle value of the sorted list, which is 7. The mean is (4 + 7 + 7 + 9 + 23) / 5 = 50 / 5 = 10. The single large value pulls the mean above the median without moving the median at all, which is the whole reason both measures exist.'),

  (null, 'A mixture contains red and blue tokens in a ratio of 3 to 5. If there are 96 tokens in total, how many are blue?',
   '[{"id":"A","text":"60"},{"id":"B","text":"48"},{"id":"C","text":"56"},{"id":"D","text":"36"},{"id":"E","text":"64"}]',
   'A', 'The ratio has 3 + 5 = 8 parts, so each part is 96 / 8 = 12 tokens. Blue is 5 parts, or 60. Choice D is the number of red tokens, which is the answer to the question this one was designed to be misread as.'),

  ('The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.', 'The mention that presses were expensive serves primarily to:',
   '[{"id":"A","text":"contrast printing with manuscript copying"},{"id":"B","text":"argue that printing was an unprofitable trade"},{"id":"C","text":"explain why printers needed an existing market before they could operate"},{"id":"D","text":"establish a chronology for the spread of the press"},{"id":"E","text":"suggest that literacy was a luxury"}]',
   'C', 'Cost is the mechanism of the argument: an expensive machine has to pay for itself, so a printer needs buyers before setting up. It is not offered as evidence that printing was unprofitable, and the passage draws no contrast with manuscripts and gives no chronology.'),

  ('Haemoglobin binds oxygen with a sigmoidal saturation curve; myoglobin binds it with a hyperbolic one.', 'What does the sigmoidal shape of the hemoglobin curve indicate?',
   '[{"id":"A","text":"Binding at one site increases the affinity of the remaining sites"},{"id":"B","text":"Haemoglobin has a higher affinity for oxygen than myoglobin at every partial pressure"},{"id":"C","text":"Haemoglobin is denatured at low oxygen partial pressures"},{"id":"D","text":"Haemoglobin binds only one oxygen molecule per protein"}]',
   'A', 'A sigmoidal curve is the signature of positive cooperativity: the first oxygen bound shifts the protein toward a higher-affinity state, so the middle of the curve is steep. That steepness is what lets hemoglobin load in the lungs and unload in tissue. Myoglobin has one site and so cannot cooperate, which is why its curve is hyperbolic and its affinity is higher, not lower.'),

  ('We speak of a language dying as though it were an organism, and the metaphor does real damage. Organisms die of causes internal to them; languages are abandoned, and abandonment is a decision made under pressure by people who can usually name the pressure exactly. A speaker who stops teaching a language to their children is not watching a natural process. They are making a calculation about what their children will need, in conditions somebody else arranged. The metaphor of death converts that arrangement into weather.', 'The central claim of the passage is that describing languages as dying:',
   '[{"id":"A","text":"obscures the human decisions and pressures behind language loss"},{"id":"B","text":"understates how quickly languages disappear"},{"id":"C","text":"is inaccurate because languages can always be revived"},{"id":"D","text":"discourages linguists from documenting endangered languages"}]',
   'A', 'The passage contrasts internal causes with decisions made under pressure "in conditions somebody else arranged", and closes by saying the metaphor converts that arrangement into weather -- that is, into something nobody chose. It makes no claim about speed, about revival, or about documentation.'),

  (null, 'Which molecule would be expected to have the highest boiling point?',
   '[{"id":"A","text":"CH4"},{"id":"B","text":"CH3OH"},{"id":"C","text":"CH3CH3"},{"id":"D","text":"CH3CH2CH3"}]',
   'B', 'Methanol is the only one with an O-H bond, so it is the only one that can hydrogen bond -- by far the strongest of the intermolecular forces here. The other three are held together by dispersion forces alone, which strengthen with size, so propane boils highest of those but still well below methanol despite being the largest molecule listed.'),

  ('In a large population at Hardy-Weinberg equilibrium, a recessive condition affects 1 in 400 individuals.', 'What proportion of the population are carriers?',
   '[{"id":"A","text":"About 1 in 400"},{"id":"B","text":"About 1 in 40"},{"id":"C","text":"About 1 in 10"},{"id":"D","text":"About 1 in 20"}]',
   'C', 'q squared = 1/400, so q = 1/20 and p is about 19/20. Carriers are 2pq, which is 2 times 19/20 times 1/20, or about 0.095 -- close to 1 in 10. Choice D reports q itself rather than the carrier frequency, which is the standard error on this calculation.'),

  (null, 'A protein destined for secretion is synthesised on ribosomes attached to which structure?',
   '[{"id":"A","text":"The smooth endoplasmic reticulum"},{"id":"B","text":"The nuclear envelope inner membrane"},{"id":"C","text":"The mitochondrial outer membrane"},{"id":"D","text":"The rough endoplasmic reticulum"}]',
   'D', 'A signal sequence directs the ribosome to the rough ER, where the growing chain is threaded into the lumen and enters the secretory pathway to the Golgi. The smooth ER is named for having no ribosomes and handles lipid synthesis and detoxification, which is what makes choice A the tempting near-miss.'),

  ('Phosphofructokinase-1 catalyzes an early, effectively irreversible step of glycolysis. It is inhibited by ATP and by citrate, and activated by AMP.', 'What does this regulation pattern most directly accomplish?',
   '[{"id":"A","text":"It prevents glucose from entering the cell when ATP is high"},{"id":"B","text":"It matches glycolytic flux to the cell''s energy demand"},{"id":"C","text":"It ensures glycolysis runs at a constant rate regardless of conditions"},{"id":"D","text":"It couples glycolysis directly to protein synthesis"}]',
   'B', 'ATP and citrate both signal that energy and carbon are plentiful and shut the pathway down; AMP signals that ATP has been spent and opens it up. Regulating an early irreversible step is how a pathway is throttled without wasting intermediates. Choice A describes transport rather than this enzyme, and choice C is the opposite of what feedback regulation does.'),

  ('A single nucleotide is deleted from the coding region of a gene, 40 codons upstream of the stop codon.', 'What is the most likely consequence for the protein product?',
   '[{"id":"A","text":"The reading frame shifts, so most residues after the deletion are wrong"},{"id":"B","text":"One amino acid is substituted and the rest of the protein is unchanged"},{"id":"C","text":"The protein is unchanged, because the genetic code is redundant"},{"id":"D","text":"Translation fails to begin at all"}]',
   'A', 'Codons are read in non-overlapping threes from a fixed start, so deleting one base shifts every codon after it -- a frameshift, which typically also produces a premature stop. Choice B describes a point substitution, choice C describes a silent mutation at the wobble position, and neither applies to an indel. The start codon is untouched, so translation still begins.'),

  ('The first commercial lighthouse keepers were paid by the ship. A vessel passing safely would settle up at the next port, and a keeper whose light had guided nobody earned nothing. It was a system with an obvious flaw, and the flaw was not that keepers were poor. It was that a light, once lit, shines on every ship in the bay, including the ones that never pay. What the lighthouse taught economics was not how to run a lighthouse. It was that some goods cannot be sold one at a time.', 'The passage implies that the payment system failed primarily because:',
   '[{"id":"A","text":"keepers could not afford to maintain their lights"},{"id":"B","text":"ports were unwilling to collect the fees"},{"id":"C","text":"ships could benefit from the light without paying for it"},{"id":"D","text":"too few ships passed to make the system viable"}]',
   'C', 'The passage names the flaw directly -- a lit light "shines on every ship in the bay, including the ones that never pay" -- and explicitly rules out poverty as the flaw in the sentence before. Ports and traffic volume are never mentioned.'),

  (null, 'A researcher finds that children of parents in the highest income quintile are far more likely to remain in that quintile as adults than chance would predict. This finding is best described as evidence of:',
   '[{"id":"A","text":"high intergenerational mobility"},{"id":"B","text":"low intergenerational mobility"},{"id":"C","text":"absolute poverty"},{"id":"D","text":"the Hawthorne effect"}]',
   'B', 'Position persisting across generations is exactly what low mobility means -- where you end up is strongly predicted by where you started. High mobility would show the opposite. Absolute poverty is a threshold measure rather than a movement one, and the Hawthorne effect concerns behavior changing under observation.'),

  ('A person can accurately reach for and grasp an object placed in front of them but cannot report its shape or orientation when asked.', 'This dissociation is most consistent with damage to which pathway?',
   '[{"id":"A","text":"The dorsal stream, leaving the ventral stream intact"},{"id":"B","text":"The optic nerve before the chiasm"},{"id":"C","text":"The ventral stream, leaving the dorsal stream intact"},{"id":"D","text":"The primary auditory cortex"}]',
   'C', 'The ventral stream supports recognition -- what an object is -- and the dorsal stream supports visually guided action -- where it is and how to reach it. Action preserved with recognition lost points to ventral damage. Choice A has it backwards, and damage before the chiasm would produce a field loss rather than this dissociation.'),

  ('Participants were asked to pull on a rope, alone and in groups. Individual force decreased as group size increased, even though participants reported trying equally hard throughout.', 'This finding is best explained by:',
   '[{"id":"A","text":"social facilitation"},{"id":"B","text":"group polarisation"},{"id":"C","text":"deindividuation"},{"id":"D","text":"social loafing"}]',
   'D', 'Reduced individual effort on a collective task where contributions cannot be separated is social loafing. Social facilitation is the opposite -- improved performance when observed -- deindividuation is loss of self-awareness in a crowd, and group polarisation is about attitudes becoming more extreme after discussion.'),

  ('Cortisol released from the adrenal cortex inhibits the release of both corticotropin-releasing hormone from the hypothalamus and adrenocorticotropic hormone from the anterior pituitary.', 'This arrangement is an example of:',
   '[{"id":"A","text":"positive feedback"},{"id":"B","text":"a reflex arc"},{"id":"C","text":"feedforward regulation"},{"id":"D","text":"negative feedback"}]',
   'D', 'The end product of the axis suppresses the signals that produced it, which damps the response and holds the system near a set point -- the definition of negative feedback. Positive feedback would amplify instead, which physiology reserves for processes meant to run to completion, such as labor or clotting.'),

  (null, 'A circle has a radius of 5. What is its circumference, in terms of π?',
   '[{"id":"A","text":"5π"},{"id":"B","text":"10π"},{"id":"C","text":"25π"},{"id":"D","text":"15π"}]',
   'B', 'Circumference is 2πr, so 2π(5) = 10π. The area formula πr^2 would give 25π, which is the commonest wrong answer -- the two formulas are worth separating by what they measure: circumference is a length, area is a length squared.'),

  (null, 'If h(x) = x + 6, what is the value of h(4)?',
   'null',
   '10', 'Function notation means substitute: replace x with 4, giving 4 + 6 = 10. h(4) does not mean h times 4, which is the misreading that makes this question worth asking at all.'),

  (null, 'If 4(x - 3) = 2x + 6, what is the value of x?',
   'null',
   '9', 'Distribute the 4 across both terms in the bracket first: 4x - 12 = 2x + 6. Subtract 2x from both sides to get 2x - 12 = 6, add 12 to get 2x = 18, and divide to get x = 9. Distributing to only the x, giving 4x - 3, is the usual error.'),

  (null, 'A population of bacteria doubles every hour. If there are 100 bacteria at time zero, how many bacteria will there be after 3 hours?',
   '[{"id":"A","text":"800"},{"id":"B","text":"400"},{"id":"C","text":"600"},{"id":"D","text":"300"}]',
   'A', 'Doubling is repeated multiplication, not addition, so after t hours the population is 100 * 2^t. After 3 hours that is 100 * 8 = 800. Adding 100 each hour instead gives 400, which is the trap this question is set to catch.'),

  (null, 'What are the solutions to x^2 - 9 = 0?',
   '[{"id":"A","text":"x = 3, -3"},{"id":"B","text":"x = -3 only"},{"id":"C","text":"x = 3 only"},{"id":"D","text":"x = 9, -9"}]',
   'A', 'Add 9 to both sides to get x^2 = 9, then take the square root of both sides -- and remember that a square root equation has two solutions, so x = 3 or x = -3. Reporting only the positive root is the point of the question. Factoring as (x - 3)(x + 3) = 0 gives the same pair.'),

  (null, 'A client with chronic obstructive pulmonary disease has an oxygen saturation of 90 percent on 2 liters per minute by nasal cannula. What should the nurse do?',
   '[{"id":"A","text":"Increase the oxygen to 6 liters per minute"},{"id":"B","text":"Remove the oxygen entirely"},{"id":"C","text":"Continue the current oxygen and monitor the client"},{"id":"D","text":"Place the client on a non-rebreather mask"}]',
   'C', 'A saturation of 88 to 92 percent is an acceptable target in COPD, so 90 percent on 2 liters is where this client should be. Pushing the saturation higher can worsen carbon dioxide retention; removing oxygen abandons a client who needs it; and a non-rebreather is a large escalation with no indication here.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;


update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  (null, 'A client with heart failure has gained 2.5 kg in three days. What does this finding most likely indicate?',
   '[{"id":"A","text":"Improved nutritional intake"},{"id":"B","text":"Measurement error"},{"id":"C","text":"Increased muscle mass"},{"id":"D","text":"Fluid retention"}]',
   'D', 'A kilogram is roughly a liter of fluid, so 2.5 kg in three days is fluid, not tissue -- nobody builds two and a half kilograms of muscle or fat in seventy-two hours. Daily weights are the most sensitive routine measure of fluid status in heart failure for exactly this reason.'),

  (null, 'A client on a psychiatric unit is pacing, speaking loudly, and clenching their fists. What is the nurse''s most appropriate initial action?',
   '[{"id":"A","text":"Speak calmly from a non-threatening distance and offer to talk in a quieter area"},{"id":"B","text":"Approach closely and place a hand on the client''s shoulder"},{"id":"C","text":"Call security to place the client in restraints"},{"id":"D","text":"Ignore the behavior so as not to reinforce it"}]',
   'A', 'De-escalation begins with a calm voice, personal space and an offer that gives the client a choice, and it works far more often than anything that follows it. Touch at this stage is likely to be read as a threat, restraints are a last resort after less restrictive measures fail, and ignoring escalating agitation lets it escalate.'),

  ('A chemist measured the solubility of a salt in water at several temperatures.

Temperature (C) | Solubility (g per 100 mL)
10              | 21
20              | 32
30              | 46
40              | 63
50              | 84', 'To test whether the relationship between temperature and solubility continues above 50 degrees Celsius, the chemist should:',
   '[{"id":"A","text":"repeat the measurement at 50 degrees Celsius several more times"},{"id":"B","text":"measure solubility at 5 degrees Celsius"},{"id":"C","text":"measure solubility of a different salt at the same temperatures"},{"id":"D","text":"measure solubility at 60 and 70 degrees Celsius using the same procedure"}]',
   'D', 'The question is about behavior above 50 C, so the procedure must be extended to temperatures above 50 C. Repeating an existing point tests precision, a different salt tests a different substance, and 5 C extends the range in the wrong direction.'),

  ('Restoration is usually described as returning a building to how it looked at some earlier moment. But every building has had many moments, and choosing one is an argument rather than a discovery. The restorer who strips a Victorian church back to its medieval fabric has not uncovered the true building; they have decided that six centuries of use were an interruption. That decision may be defensible. What it is not is neutral, and the language of restoration -- returning, uncovering, revealing -- works hard to make it sound as though no decision was made at all.', 'Which situation is most analogous to the author''s central concern?',
   '[{"id":"A","text":"An editor calling a heavily rewritten manuscript the author''s definitive text"},{"id":"B","text":"A museum labeling a reconstructed vase as an original"},{"id":"C","text":"A conservationist removing an invasive species from a wetland"},{"id":"D","text":"A translator producing two versions of a poem for different audiences"}]',
   'A', 'The concern is that a word implies a single true version was recovered when in fact one was chosen from many. "Definitive" does exactly that work for a manuscript with many states. The vase case is straightforward misrepresentation rather than a concealed choice; the wetland has an uncontested baseline; and the translator with two versions is being openly plural, which is the opposite of the complaint.'),

  ('In a study, participants heard a tone immediately before receiving a mild puff of air to the eye. After many pairings, participants blinked when the tone was played alone.', 'In this experiment, the tone is best described as:',
   '[{"id":"A","text":"an unconditioned stimulus"},{"id":"B","text":"an unconditioned response"},{"id":"C","text":"a conditioned stimulus"},{"id":"D","text":"a negative reinforcer"}]',
   'C', 'The air puff produces a blink without any learning, which makes it the unconditioned stimulus. The tone started neutral and acquired its power through pairing, which is the definition of a conditioned stimulus. Reinforcement belongs to operant conditioning, where behavior is emitted rather than elicited.'),

  ('Researchers measured the rate of an enzyme-catalyzed reaction at several temperatures. Rate rose steadily from 20 to 40 degrees Celsius, peaked near 42 degrees, then fell sharply, reaching almost zero by 60 degrees. A parallel run with the same reactants and no enzyme showed rate rising steadily across the entire range.', 'Which explanation best accounts for the difference between the two runs above 45 degrees Celsius?',
   '[{"id":"A","text":"The uncatalysed reaction has a lower activation energy at high temperature"},{"id":"B","text":"The equilibrium constant of the catalyzed reaction decreases with temperature"},{"id":"C","text":"The reactants are consumed faster in the catalyzed run"},{"id":"D","text":"The enzyme denatures, removing the catalyzed pathway, while the uncatalysed reaction continues to speed up"}]',
   'D', 'Rate rises with temperature for any reaction because more collisions clear the activation barrier. An enzyme adds a lower-barrier pathway, but it is a protein and loses its tertiary structure above its optimum, which removes that pathway entirely. Choice A inverts the definition of a catalyst; choice C would affect both runs; and a change in equilibrium constant describes where the reaction ends up, not how fast it gets there.'),

  ('A driver is cut off in traffic and immediately concludes that the other driver is reckless and inconsiderate. Later the same day, the driver cuts someone off while rushing to a hospital, and attributes it to the emergency.', 'This pattern is best described as:',
   '[{"id":"A","text":"cognitive dissonance"},{"id":"B","text":"the fundamental attribution error, applied asymmetrically to self and other"},{"id":"C","text":"the just-world hypothesis"},{"id":"D","text":"groupthink"}]',
   'B', 'Explaining someone else''s behavior by their character while explaining one''s own by the situation is the actor-observer asymmetry of the fundamental attribution error. Dissonance is the discomfort of holding conflicting beliefs, the just-world hypothesis is the belief that people get what they deserve, and groupthink is a failure of group decision-making.'),

  ('A city reduced its speed limit on residential streets and reported a 22 percent fall in collisions the following year. Officials concluded that the lower limit caused the reduction.', 'Which finding, if true, most weakens the officials'' conclusion?',
   '[{"id":"A","text":"Some drivers exceeded the new limit"},{"id":"B","text":"Collisions fell by a similar amount in neighboring cities that did not change their limits"},{"id":"C","text":"The reduction was larger on some streets than on others"},{"id":"D","text":"The new limit was unpopular with commuters"},{"id":"E","text":"Enforcement of the limit increased slightly"}]',
   'B', 'If cities that changed nothing saw the same fall, the fall was produced by something affecting all of them and not by the policy -- that removes the causal link rather than merely qualifying it. Non-compliance and uneven effects are compatible with the policy working, unpopularity is irrelevant to whether it worked, and increased enforcement would if anything strengthen the case.'),

  ('In a formal lab report: "The temperature readings from the second trial were ______ compared with the first."', 'Which choice best maintains the tone of the report?',
   '[{"id":"A","text":"substantially lower"},{"id":"B","text":"way off"},{"id":"C","text":"kind of low"},{"id":"D","text":"a total mess"}]',
   'A', 'A lab report calls for precise, neutral language. The other three are conversational, and two of them are vague about direction as well as degree.'),

  ('Although the treaty was signed with great ceremony, its provisions were ______ from the first week, and by spring neither side was pretending otherwise.', 'Which word best fits the context?',
   '[{"id":"A","text":"flaunted"},{"id":"B","text":"flouted"},{"id":"C","text":"fostered"},{"id":"D","text":"formalized"}]',
   'B', 'To flout is to disregard openly, which is what the second clause describes. "Flaunt" means to display showily and is the classic confusion here; "fostered" and "formalized" both mean the treaty was being upheld.'),

  ('Wind turbines kill an estimated hundreds of thousands of birds each year in the United States. ______ buildings and domestic cats are each responsible for losses two to three orders of magnitude larger.', 'Which transition best fits the relationship between the two sentences?',
   '[{"id":"A","text":"Consequently,"},{"id":"B","text":"Similarly,"},{"id":"C","text":"For perspective,"},{"id":"D","text":"In other words,"}]',
   'C', 'The second sentence supplies a comparison that reframes the size of the first figure. It is not a consequence, not a restatement, and not a parallel case -- the whole point is the difference in scale.'),

  (null, 'A culture of 500 bacteria doubles every 3 hours. Which expression gives the population after t hours?',
   '[{"id":"A","text":"500 * 2^(3t)"},{"id":"B","text":"500 * 3^(t/2)"},{"id":"C","text":"500 * 2^(t/3)"},{"id":"D","text":"500 + 2^(t/3)"}]',
   'C', 'One doubling happens per 3 hours, so the exponent counts doublings: t/3. Choice A doubles three times an hour, and B swaps the base with the interval.'),

  ('Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.', 'According to the passage, Carnegie''s grants required a town to:',
   '[{"id":"A","text":"provide the site and commit annual public funding for operations"},{"id":"B","text":"repay the construction cost over ten years"},{"id":"C","text":"name the library after Carnegie"},{"id":"D","text":"match his grant dollar for dollar before construction began"}]',
   'A', 'The passage states the two conditions directly: supply the site, and commit public money each year to running it. Repayment, naming and dollar-for-dollar matching are not mentioned.'),

  ('For thirty years my grandmother kept a ledger of every plant she put in the ground: the date, the weather, the corner of the garden, and, in a column she headed simply "Result", one of three words -- thrived, struggled, died. She did not garden by feel. She gardened by evidence, and the evidence was mostly of failure. Nine notebooks sit on my shelf now, and what strikes me is not the successes, which are few, but how patiently she recorded the losses.', 'As it is used in the passage, the word "patiently" most nearly means:',
   '[{"id":"A","text":"calmly, without irritation"},{"id":"B","text":"persistently, without giving up the record"},{"id":"C","text":"slowly, at an unhurried pace"},{"id":"D","text":"quietly, without telling anyone"}]',
   'B', 'The narrator is struck by thirty years of recording losses, so the word carries the sense of persistence over time. The passage says nothing about her mood, her speed, or her secrecy.'),

  ('Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.', 'Which choice best describes the structure of the passage?',
   '[{"id":"A","text":"A chronological account of one library''s construction"},{"id":"B","text":"A claim, then two counterarguments, then a concession"},{"id":"C","text":"A statistic, then a common misunderstanding corrected, then evidence that the correction matters"},{"id":"D","text":"A comparison of philanthropic models in two countries"}]',
   'C', 'The passage opens with growth figures, notes a condition that is "often forgotten", and closes with towns that refused -- evidence the forgotten condition had consequences. There is no counterargument, no single library narrative and no second country.'),

  ('Experiment 1: Seedlings of one species were grown for 21 days under lamps of four colors -- red, blue, green, and white -- with all lamps set to the same intensity. Mean height was recorded.
Experiment 2: The same procedure was repeated, but each pot also received one of three fertilizer concentrations.

Color  | Exp 1 mean height (cm)
Red    | 12.4
Blue   | 15.1
Green  | 6.8
White  | 14.7', 'In Experiment 1, keeping every lamp at the same intensity was necessary in order to:',
   '[{"id":"A","text":"ensure that the seedlings received enough total light to survive"},{"id":"B","text":"reduce the total time the experiment required"},{"id":"C","text":"make light color the only variable differing among the groups"},{"id":"D","text":"allow the results to be compared with Experiment 2"}]',
   'C', 'Holding intensity constant isolates color as the manipulated variable. If intensity varied with color, a height difference could be caused by either, and the experiment would answer neither question.'),

  ('Dissolved oxygen was measured at four depths in a lake in July and again in January.

Depth (m) | July DO (mg/L) | January DO (mg/L)
0         | 8.9            | 12.6
5         | 8.1            | 12.0
10        | 4.2            | 11.8
20        | 0.6            | 11.5', 'The January measurements differ from the July measurements most importantly in that in January:',
   '[{"id":"A","text":"oxygen falls sharply below 5 m"},{"id":"B","text":"oxygen is nearly uniform with depth"},{"id":"C","text":"oxygen is lowest at the surface"},{"id":"D","text":"oxygen exceeds 15 mg/L at every depth"}]',
   'B', 'The January values run 12.6, 12.0, 11.8, 11.5 -- a spread of about 1 mg/L across 20 m, against a July spread of more than 8. The sharp drop below 5 m is the July pattern, not January''s.'),

  (null, 'If 5x - 3 = 27, what is the value of x?',
   '[{"id":"A","text":"6"},{"id":"B","text":"5"},{"id":"C","text":"4"},{"id":"D","text":"7"}]',
   'A', 'Add 3 to both sides to isolate the term with x, giving 5x = 30, then divide by 5 to get x = 6. Note that the 3 is subtracted, so it moves across the equals sign by addition rather than subtraction.'),

  ('The essay first summarizes a critic''s harsh review of a novel, then presents excerpts from the novel that seem to directly contradict the critic''s specific claims, and closes by inviting readers to judge the book for themselves.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It compares the novel to an earlier work by the same author."},{"id":"B","text":"It summarizes the novel''s plot in chronological order."},{"id":"C","text":"It presents a critique, offers counter-evidence to that critique, and leaves the final judgment open."},{"id":"D","text":"It refutes the critic using the critic''s own biography."}]',
   'C', 'The order described -- critique, counter-evidence, open invitation to judge -- matches only choice C.'),

  ('The op-ed begins by conceding that the city''s new bike lanes have reduced commute times for cyclists, then pivots to argue that the lanes have made deliveries slower for local businesses, and ends by proposing a compromise redesign.', 'Which choice best describes the overall structure of the text?',
   '[{"id":"A","text":"It tells a chronological history of the bike lanes."},{"id":"B","text":"It presents only one side of the issue throughout."},{"id":"C","text":"It concedes a benefit, raises a drawback, and proposes a compromise."},{"id":"D","text":"It compares bike lanes in two different cities."}]',
   'C', 'The described sequence -- concession, drawback, compromise -- matches only choice C.'),

  ('A mid-sized publisher shifted half its catalog to audiobook-first releases, delaying print editions by three months. Over the following two years, audiobook sales in that catalog grew by sixty percent, while print sales for the same titles fell by only eight percent once they finally reached shelves.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"Audiobook sales fell after the strategy was introduced."},{"id":"B","text":"Audiobooks have completely replaced print books at this publisher."},{"id":"C","text":"Delaying print editions always hurts a publisher''s business."},{"id":"D","text":"The publisher''s audiobook-first strategy grew audiobook sales substantially while only modestly reducing eventual print sales."}]',
   'D', 'Both outcomes reported -- strong audiobook growth and only a modest print decline -- support choice D; the others overstate or contradict the passage.'),

  ('Between 1870 and 1910 the number of public libraries in the United States rose from fewer than 200 to more than 3,000. Andrew Carnegie funded roughly half of the new buildings, but his grants came with a condition that is often forgotten: the town had to supply the site and commit public money -- usually a tenth of the construction cost, every year -- to running the library once it opened. Towns that would not make the commitment did not get the building, and several dozen refused.', 'The author includes the final sentence primarily to:',
   '[{"id":"A","text":"suggest that Carnegie regretted imposing the condition"},{"id":"B","text":"criticize the towns that declined the grants"},{"id":"C","text":"explain why library construction slowed after 1910"},{"id":"D","text":"show that the condition was a real constraint rather than a formality"}]',
   'D', 'Naming towns that refused demonstrates that the requirement had teeth. The sentence passes no judgment on those towns, says nothing about the period after 1910, and reports nothing about Carnegie''s feelings.'),

  (null, 'In a survey of 300 students, 180 said they prefer online classes. If the survey''s margin of error is plus or minus 4 percentage points, which of the following is closest to the range of the true percentage of all students who prefer online classes?',
   '[{"id":"A","text":"50% to 70%"},{"id":"B","text":"56% to 64%"},{"id":"C","text":"40% to 80%"},{"id":"D","text":"60% to 60%"}]',
   'B', '180/300 = 60%. Applying the +/- 4 point margin of error gives a range of 56% to 64%.'),

  (null, 'What are the solutions to x^2 - 5x + 6 = 0?',
   '[{"id":"A","text":"x = 2, 3"},{"id":"B","text":"x = 1, 6"},{"id":"C","text":"x = -2, -3"},{"id":"D","text":"x = 2, -3"}]',
   'A', 'Factoring gives (x - 2)(x - 3) = 0, so x = 2 or x = 3.'),

  ('By the time the inspectors arrived, the crew ______ already sealed the leak and restarted the pump.', 'Which choice completes the text so that it conforms to the conventions of Standard English?',
   '[{"id":"A","text":"has"},{"id":"B","text":"have"},{"id":"C","text":"having"},{"id":"D","text":"had"}]',
   'D', 'A past action completed before another past action ("by the time... arrived") requires the past perfect "had".'),

  ('A student is writing about a school''s new composting program and has these notes: (1) The program diverts about 200 pounds of food waste from landfills each week. (2) Students volunteer in rotating shifts to sort compostable material. (3) The finished compost is used in the school''s vegetable garden. (4) A few students found the sorting process confusing at first.', 'The student wants to show how the program creates a complete, closed loop from waste to reuse. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Food waste collected by the program becomes compost that is then used in the school''s own vegetable garden."},{"id":"B","text":"Students volunteer in rotating shifts to sort compostable material."},{"id":"C","text":"The program diverts about 200 pounds of food waste from landfills each week."},{"id":"D","text":"A few students found the sorting process confusing at first."}]',
   'A', 'Only choice A ties the waste collection directly to its reuse (compost feeding the garden), forming the closed loop the student wants to show.'),

  ('Critics initially dismissed the young violinist''s interpretation as too unconventional, but audiences found her willingness to depart from tradition ______ rather than distracting.', 'Which choice completes the text with the most logical and precise word?',
   '[{"id":"A","text":"invigorating"},{"id":"B","text":"tedious"},{"id":"C","text":"forgettable"},{"id":"D","text":"predictable"}]',
   'A', 'The contrast word "rather than distracting" signals a positive quality; "invigorating" fits, the others do not.'),

  ('A student is writing a report on urban beekeeping and has gathered these notes: (1) Urban beehives can pollinate rooftop gardens within a two-mile radius. (2) Rooftop gardens increase insulation, lowering building energy costs. (3) Local ordinances in several cities now permit registered hobbyist hives. (4) Beekeeping requires basic protective equipment and periodic hive inspections.', 'The student wants to emphasize a benefit that connects beekeeping directly to building energy efficiency. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Urban beehives can pollinate gardens within a two-mile radius, making them useful across a whole neighborhood."},{"id":"B","text":"Several cities now allow registered hobbyist hives under local ordinances."},{"id":"C","text":"Beekeeping requires only basic protective equipment, making it accessible to most hobbyists."},{"id":"D","text":"Because rooftop gardens pollinated by urban hives improve insulation, beekeeping can indirectly lower a building''s energy costs."}]',
   'D', 'Only choice D links beekeeping to building energy efficiency, combining notes 1 and 2 into a single cause-and-effect claim.'),

  (null, 'A nurse is setting up a sterile field and turns away briefly to answer a colleague''s question. What should the nurse do?',
   '[{"id":"A","text":"Continue using the field, since nothing visibly contaminated it"},{"id":"B","text":"Cover the field with a sterile drape and continue"},{"id":"C","text":"Use only the center of the field, which remains sterile"},{"id":"D","text":"Consider the field contaminated and set up a new one"}]',
   'D', 'A sterile field that is out of the setter''s sight is considered contaminated, whether or not anything is seen to touch it. Sterility is a status maintained by continuous observation, not a property judged by appearance -- which is why "it looked fine" is never the standard.'),

  ('Scientist 1 argues that the megafauna of North America died out primarily because of rapid climate warming at the end of the last glacial period, which fragmented the habitats large herbivores depended on.
Scientist 2 argues that human hunting was the primary cause, noting that extinctions on several continents track the arrival of humans more closely than they track any climate signal.', 'Which finding, if confirmed, would most weaken Scientist 2''s argument?',
   '[{"id":"A","text":"On a continent where humans arrived thousands of years before the warming, megafauna persisted until the warming began."},{"id":"B","text":"Butchery marks on mammoth bones are found at several sites in North America."},{"id":"C","text":"Human populations grew quickly after the megafauna declined."},{"id":"D","text":"Some large herbivores survived in isolated regions for several thousand more years."}]',
   'A', 'Scientist 2 rests on extinctions tracking human arrival. A continent where humans arrived long before and the animals survived until the climate changed breaks exactly that correlation. A supports Scientist 2, C is ambiguous about direction, and D is compatible with either account.'),

  (null, 'In a right triangle, one angle measures 30 degrees and the side opposite that angle has length 6. What is the length of the hypotenuse?',
   '[{"id":"A","text":"6"},{"id":"B","text":"12"},{"id":"C","text":"9"},{"id":"D","text":"6√3"}]',
   'B', 'sin(30 degrees) = 0.5 = opposite/hypotenuse = 6/hypotenuse, so hypotenuse = 6/0.5 = 12.'),

  ('A city planner spent a decade studying how public parks affect nearby home values. Her research, drawn from over two hundred neighborhoods, found that homes within a quarter mile of a well-maintained park sold for an average of eight percent more than similar homes farther away.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"Proximity to a well-maintained park is associated with higher home sale prices."},{"id":"B","text":"Home values are determined mainly by school district quality."},{"id":"C","text":"City planners rarely study the effects of parks."},{"id":"D","text":"Only homes near parks are ever renovated."}]',
   'A', 'The passage''s central finding is the link between park proximity and higher sale prices; the other choices are unsupported or contradicted.'),

  ('A teacher noticed that students who sat near the front of the classroom asked more questions during lectures, regardless of which subject was being taught, since seating was reassigned randomly every month.', 'Which choice best describes what the teacher''s observations most strongly suggest?',
   '[{"id":"A","text":"Only certain students ever ask questions in class."},{"id":"B","text":"Front-row seating itself, rather than which students sat there, was linked to more questions being asked."},{"id":"C","text":"The subject being taught determined how many questions were asked."},{"id":"D","text":"Random seating assignments confused the students."}]',
   'B', 'Since seating rotated randomly yet the front-row pattern held regardless of subject or student, the seating position itself is the strongest supported factor.'),

  ('A student is writing about a small town''s switch to solar streetlights and has these notes: (1) Solar streetlights eliminated the town''s monthly electric bill for street lighting entirely. (2) Installation required no new wiring, since each light is self-contained. (3) A few residents complained the lights were dimmer than the old sodium lamps. (4) The town used savings from lower electric bills to repave two roads.', 'The student wants to connect the streetlight switch to a concrete financial benefit for the town. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Solar streetlights are self-contained and required no new wiring during installation."},{"id":"B","text":"By eliminating the electric bill for street lighting, the town freed up savings that funded repaving two roads."},{"id":"C","text":"Some residents felt the new lights were dimmer than the old sodium lamps."},{"id":"D","text":"The switch to solar streetlights took place over several months."}]',
   'B', 'Only choice B ties the switch to a concrete financial outcome (savings that funded road repaving); the others are installation logistics or unrelated complaints.'),

  ('An enzyme was assayed at a range of substrate concentrations, with and without an added compound X. Without X, the apparent Km was 4 micromolar and Vmax was 100 units. With X present, the apparent Km rose to 12 micromolar while Vmax remained 100 units.', 'What type of inhibition does compound X most likely exhibit?',
   '[{"id":"A","text":"Uncompetitive"},{"id":"B","text":"Noncompetitive"},{"id":"C","text":"Competitive"},{"id":"D","text":"Irreversible"}]',
   'C', 'A competitive inhibitor binds the active site and can be outcompeted by enough substrate, so Vmax is unchanged while the substrate concentration needed to reach half of it rises -- exactly the pattern here. Noncompetitive inhibition lowers Vmax with Km unchanged, uncompetitive lowers both, and irreversible inhibition lowers Vmax by permanently removing enzyme.'),

  (null, 'A client''s adult sibling telephones the unit and asks for an update on the client''s condition. What should the nurse do?',
   '[{"id":"A","text":"Provide a general update since the caller is an immediate family member"},{"id":"B","text":"Transfer the call to the provider so that they can decide"},{"id":"C","text":"Refuse to acknowledge that the client is in the facility under any circumstances"},{"id":"D","text":"Confirm whether the client has authorized the release of information to this person"}]',
   'D', 'Being a relative does not by itself authorize disclosure, so the nurse verifies whether this caller is someone the client has authorized. A blanket refusal to acknowledge that the client is in the facility goes further than the law requires and is only correct when the client has opted out of the directory; handing the call to the provider passes the problem along without solving it. The distinction worth keeping: protecting information is always required, pretending the client does not exist is not.'),

  ('A student is writing about community gardens and has these notes: (1) Community gardens can reduce a neighborhood''s average summer temperature by providing shade and ground cover. (2) Participants report a stronger sense of neighborhood connection after gardening together. (3) Some cities offer small grants to start a garden plot. (4) Garden plots require regular watering, which can be a challenge during droughts.', 'The student wants to highlight an environmental benefit of community gardens. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Some cities provide small grants to help residents start a garden plot."},{"id":"B","text":"Participants often feel more connected to their neighbors after gardening together."},{"id":"C","text":"Community gardens can lower a neighborhood''s average summer temperature through shade and ground cover."},{"id":"D","text":"Garden plots need regular watering, which is difficult during droughts."}]',
   'C', 'Only choice C describes an environmental effect (lower temperature); the others are social, financial, or logistical points from the notes.'),

  ('Public health officials long assumed that a city''s clean-water initiative was the main reason childhood illness rates fell in the 1990s. A later review of hospital admission records found that the decline had already begun five years before the initiative launched, coinciding instead with the citywide rollout of a childhood vaccination program.', 'Which choice best states the main idea of the text?',
   '[{"id":"A","text":"The clean-water initiative was solely responsible for the drop in childhood illness."},{"id":"B","text":"Hospital admission records from the 1990s are unreliable."},{"id":"C","text":"A vaccination program, not just the clean-water initiative, likely contributed to the earlier decline in childhood illness."},{"id":"D","text":"Childhood illness rates have never changed in this city."}]',
   'C', 'The review complicates the water-only explanation with evidence that the decline began earlier, alongside the vaccination rollout.'),

  (null, 'A nurse receives report on four clients. Which client requires the most immediate attention?',
   '[{"id":"A","text":"A client with a blood glucose of 210 mg/dL"},{"id":"B","text":"A client with a hemoglobin of 9.2 g/dL"},{"id":"C","text":"A client with a temperature of 38.1 degrees Celsius"},{"id":"D","text":"A client with a potassium level of 6.8 mEq/L"}]',
   'D', 'A potassium of 6.8 mEq/L is severe hyperkalemia and carries an immediate risk of lethal dysrhythmia -- it is a cardiac emergency, not a laboratory abnormality. The other three are all abnormal and all need attention, but none of them will stop a heart in the next few minutes. The reusable principle: rank abnormal values by how fast they kill, not by how far they are from normal.'),

  (null, 'A client with decision-making capacity refuses a blood transfusion for religious reasons despite a hemoglobin of 6.5 g/dL. What is the nurse''s most appropriate action?',
   '[{"id":"A","text":"Administer the transfusion because the client''s life is at risk"},{"id":"B","text":"Document the refusal, notify the provider, and support the client''s decision"},{"id":"C","text":"Ask a family member to sign the consent instead"},{"id":"D","text":"Explain that the refusal will be overridden by the hospital ethics committee"}]',
   'B', 'A client with capacity has the right to refuse any treatment, including one that is life-sustaining, and administering it anyway is battery. The nurse documents, informs the provider so alternatives can be discussed, and supports the client. A family member cannot consent for a client who has capacity, and no ethics committee overrides a capable refusal.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;


update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
  ('The results were widely reported as a breakthrough, though the authors themselves were careful to describe them as ______, pending replication in a larger sample.', 'Select the word that best completes the text.',
   '[{"id":"A","text":"conclusive"},{"id":"B","text":"unprecedented"},{"id":"C","text":"provisional"},{"id":"D","text":"exhaustive"},{"id":"E","text":"controversial"}]',
   'C', 'The authors are contrasted with the reporting, and "pending replication" tells you what they meant: not yet settled. "Provisional" fits exactly. "Conclusive" and "exhaustive" both say the opposite, "unprecedented" is about novelty, and nothing in the sentence suggests dispute.'),

  (null, 'A client being discharged after a stroke has difficulty swallowing thin liquids. Which referral is most appropriate for the nurse to initiate?',
   '[{"id":"A","text":"Physical therapy"},{"id":"B","text":"Speech-language pathology"},{"id":"C","text":"Respiratory therapy"},{"id":"D","text":"Social work"}]',
   'B', 'Swallowing evaluation and dysphagia management belong to speech-language pathology. Physical therapy addresses mobility, respiratory therapy addresses ventilation and airway clearance, and social work addresses discharge resources -- all of which this client may also need, but none of which assesses a swallow.'),

  (null, 'Before administering digoxin, the nurse counts an apical pulse of 52 beats per minute in an adult client. What should the nurse do?',
   '[{"id":"A","text":"Administer the dose as scheduled"},{"id":"B","text":"Administer half the dose"},{"id":"C","text":"Hold the dose and notify the provider"},{"id":"D","text":"Recheck the radial pulse and administer if it is above 60"}]',
   'C', 'Digoxin slows conduction, so it is held in an adult when the apical rate is below 60 and the prescriber is notified. Splitting a dose is prescribing, and a radial pulse is less reliable than an apical one in a client who may have a pulse deficit -- checking the easier site to get the answer you want is the trap here.'),

  ('The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.', 'The passage suggests that a town with a press that failed quickly most likely:',
   '[{"id":"A","text":"lacked an established reading public when the press arrived"},{"id":"B","text":"had unusually high printing costs"},{"id":"C","text":"had banned printed material"},{"id":"D","text":"was located far from major trade routes"},{"id":"E","text":"had more presses than it could support"}]',
   'A', 'The passage pairs late arrival and frequent failure with towns lacking schools and a merchant class -- that is, lacking readers. Cost is described as uniformly high rather than variable by town, and bans, trade routes and oversupply are never mentioned.'),

  ('The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.', 'The primary purpose of the passage is to:',
   '[{"id":"A","text":"argue that the printing press had little effect on literacy"},{"id":"B","text":"explain why early printers frequently went out of business"},{"id":"C","text":"compare literacy rates in towns with and without schools"},{"id":"D","text":"complicate a standard causal account without wholly rejecting it"},{"id":"E","text":"describe the economics of press ownership in detail"}]',
   'D', 'The passage says the causation runs "the other way at least as often" -- not always -- and the final clause concedes that the press did enlarge its market once established. That is a complication rather than a rejection, which rules out A. The town comparison and the failed printers are evidence for the argument rather than the point of it.'),

  (null, 'A client''s blood pressure drops from 128/78 to 88/52 one hour after starting a new antihypertensive. What should the nurse do first?',
   '[{"id":"A","text":"Document the reading and reassess in four hours"},{"id":"B","text":"Administer the next scheduled dose as ordered"},{"id":"C","text":"Place the client in high Fowler position"},{"id":"D","text":"Recheck the blood pressure and assess the client for symptoms"}]',
   'D', 'Confirm the finding and assess the client before acting on a single reading -- a mis-cuffed or mis-timed measurement is common, and what the client looks like decides how urgent this is. Giving the next dose acts on an unconfirmed number in the wrong direction, sitting the client up lowers the pressure further, and waiting four hours is too long if the reading is real.'),

  ('A researcher studying sleep found that participants who used a blue-light filter on their phones before bed fell asleep an average of eleven minutes faster than those who did not, even though both groups reported similar amounts of screen time and similar bedtimes.', 'Which finding from the study most directly supports the idea that the blue-light filter, not screen time or bedtime, affected how quickly participants fell asleep?',
   '[{"id":"A","text":"Participants in both groups used their phones in the hour before bed."},{"id":"B","text":"Filter users fell asleep an average of eleven minutes faster than non-users."},{"id":"C","text":"Both groups had similar screen time and bedtimes, yet filter users fell asleep faster."},{"id":"D","text":"Filter users reported going to bed slightly earlier than non-users."}]',
   'C', 'The claim singles out the filter over screen time and bedtime, so the evidence has to hold those constant. Choice B gives the result without ruling anything out, and choice D breaks the very control the claim depends on -- if the filter group also went to bed earlier, bedtime is back in play.'),

  ('A student is writing about a local library''s tool-lending program and has these notes: (1) The program lends power tools, checked out like books, for home repair projects. (2) Membership in the program is free with a library card. (3) A safety training video is required before a member''s first tool checkout. (4) The program has reduced the number of unreturned tools compared to the library''s earlier, ungoverned tool shelf.', 'The student wants to emphasize that the program improved on a previous, less structured system. Which choice most effectively uses the notes to accomplish this goal?',
   '[{"id":"A","text":"Tools are checked out like books, a process members already know."},{"id":"B","text":"The program lends power tools on a library card, with no membership fee."},{"id":"C","text":"A safety video is required before a first checkout, unlike under the old shelf."},{"id":"D","text":"Unlike the library''s earlier, ungoverned shelf, the program has cut unreturned tools."}]',
   'D', 'The goal is to show the program improved on what came before, which needs both a comparison and an outcome. Choice C makes the comparison but names a rule rather than a result; choices B and A describe the program without reference to the old shelf at all.'),

  ('A city noticed that potholes reported through its new mobile app were repaired twice as fast, on average, as potholes reported by phone call, even though the same repair crews and the same budget covered both types of reports.', 'Which choice best describes what the city''s data most strongly suggests?',
   '[{"id":"A","text":"The city assigned its faster crews to app-reported potholes."},{"id":"B","text":"App reports came from residents living closer to the potholes they reported."},{"id":"C","text":"The reporting method, rather than crews or budget, tracked how fast a pothole was fixed."},{"id":"D","text":"Potholes reported by phone were in less accessible parts of the city."}]',
   'C', 'The same crews and the same budget covered both kinds of report, so neither can explain the gap and the reporting method is what remains. The other three are plausible-sounding alternatives, and each contradicts a condition the passage states.'),

  ('A factory manager noticed that defect rates fell sharply every time a particular supervisor was on shift, regardless of which workers were present or which products were being made. When that supervisor took a two-week vacation, defect rates returned to their previous, higher level almost immediately.', 'Which choice best describes what the manager''s observations most strongly suggest?',
   '[{"id":"A","text":"Certain products were more likely to be made on the supervisor''s shifts."},{"id":"B","text":"The workers on the supervisor''s shifts were more experienced than the others."},{"id":"C","text":"Defect rates rose during the vacation because equipment went unmaintained."},{"id":"D","text":"The supervisor''s presence, rather than the workers or products, tracked the defect rate."}]',
   'D', 'The passage rules out the workers and the products explicitly -- the pattern held regardless of both -- which leaves the supervisor''s presence. Choices B and A are the two explanations the passage has already eliminated, and choice C invents a mechanism nothing supports.'),

  ('A wildlife photographer found that a normally shy fox family allowed her to approach closely only on mornings after a light rain, never on dry mornings, regardless of the season or which member of the family was nearby.', 'Which choice best describes what the photographer''s observation most strongly suggests?',
   '[{"id":"A","text":"The foxes allowed closer approach during one season than the others."},{"id":"B","text":"The foxes had grown used to the photographer over several seasons."},{"id":"C","text":"One particular fox was more tolerant than the rest of the family."},{"id":"D","text":"Recent rain, rather than the season or which fox was present, tracked the tolerance."}]',
   'D', 'The pattern held regardless of season and regardless of which fox was nearby, and the passage states both -- which rules out choices C and D directly. Choice B would predict a gradual change over time rather than a clean split between wet and dry mornings.'),

  ('A cafe owner noticed that the espresso machine only jammed on mornings when the barista training video played in the back room, never on mornings when it did not, even though different baristas worked each type of morning.', 'Which choice best describes what the pattern most strongly suggests?',
   '[{"id":"A","text":"Playing the video made the baristas work less carefully."},{"id":"B","text":"The barista on duty determined whether the machine jammed."},{"id":"C","text":"The machine jammed at unpredictable intervals through the week."},{"id":"D","text":"Something about the mornings the video played was linked to the jams."}]',
   'D', 'The jams tracked the video regardless of which barista worked, so the barista is ruled out and the mornings the video played are what remain. Choice A names a specific mechanism the passage gives no evidence for, and an inference question asks what the pattern supports rather than what could explain it.')
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;
