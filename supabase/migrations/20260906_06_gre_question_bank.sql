-- An original GRE-style question bank.
--
-- Every item was written for this migration. None of it reproduces,
-- paraphrases or is derived from an ETS item. What is taken from ETS is the
-- published structure of the shortened General Test: two Verbal Reasoning
-- measures and two Quantitative, each scored 130 to 170, with the second
-- section of each measure pitched to how the first went.
--
-- That section-level adaptivity is why the GRE blueprint declares two
-- modules per section while the ACT and MCAT declare one: the engine's
-- existing two-module routing is the right shape for it. AceDecks routes on
-- its own transparent accuracy threshold and does not reproduce ETS's.
--
-- Verbal here is text completion, sentence equivalence and reading
-- comprehension. Sentence equivalence on the real exam asks for TWO answers
-- that produce the same meaning, which is stored as a multiple_response item
-- and graded all-or-nothing, exactly as ETS scores it.
--
-- The Analytical Writing measure is deliberately absent. It is a written
-- task, and faking it as a multiple-choice item would teach the wrong thing.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  -- ============== Verbal Reasoning ==============

  ('verbal', 'Text completion', 'Single blank', 'easy', 'multiple_choice',
    'Although the committee had been assembled to resolve the dispute, its members proved so ______ that they could not agree even on an agenda.',
    'Select the word that best completes the text.',
    '[{"id":"A","text":"conciliatory"},{"id":"B","text":"fractious"},{"id":"C","text":"punctual"},{"id":"D","text":"resourceful"},{"id":"E","text":"deferential"}]',
    'B', 'The word "Although" sets up a contrast: the committee was meant to resolve a dispute but could not agree on anything. "Fractious" means quarrelsome, which supplies the contrast. "Conciliatory" and "deferential" both describe people who agree easily, which removes the contrast entirely, and punctuality and resourcefulness have no bearing on agreement.'),

  ('verbal', 'Text completion', 'Single blank', 'medium', 'multiple_choice',
    'Far from being the ______ figure of legend, the explorer emerges from these letters as anxious, indecisive, and frequently homesick.',
    'Select the word that best completes the text.',
    '[{"id":"A","text":"intrepid"},{"id":"B","text":"obscure"},{"id":"C","text":"prolific"},{"id":"D","text":"reticent"},{"id":"E","text":"itinerant"}]',
    'A', '"Far from being" signals that the blank is the opposite of what follows, and what follows is anxious and indecisive. "Intrepid" means fearless, which is the opposite required. "Obscure" and "reticent" are closer to the letters than against them, and neither "prolific" nor "itinerant" contrasts with anxiety.'),

  ('verbal', 'Text completion', 'Two blanks', 'hard', 'multiple_choice',
    'The author''s prose is often called difficult, but the difficulty is (i) ______ rather than accidental: every ambiguity is placed, and the reader who slows down finds the sentence (ii) ______ its own instructions for being read.',
    'Which pair best completes the text? Select one pair.',
    '[{"id":"A","text":"(i) deliberate  (ii) containing"},{"id":"B","text":"(i) unfortunate  (ii) concealing"},{"id":"C","text":"(i) deliberate  (ii) resisting"},{"id":"D","text":"(i) inevitable  (ii) refusing"},{"id":"E","text":"(i) trivial  (ii) containing"}]',
    'A', 'The first blank is opposed to "accidental" and supported by "every ambiguity is placed", so it must mean intended. The second is what the slow reader finds, and the sentence rewards them, so it must be positive. Choice C has the first blank right and the second backwards, which is exactly how a two-blank item is usually missed -- both halves have to work.'),

  ('verbal', 'Sentence equivalence', 'Equivalent completions', 'medium', 'multiple_response',
    'The new policy was praised as bold and denounced as reckless, which suggests that its authors had at least succeeded in being ______.',
    'Select the TWO answer choices that best complete the text and produce sentences alike in meaning.',
    '[{"id":"A","text":"decisive"},{"id":"B","text":"forthright"},{"id":"C","text":"cautious"},{"id":"D","text":"resolute"},{"id":"E","text":"ambiguous"},{"id":"F","text":"popular"}]',
    'A,D', 'A policy called both bold and reckless is at least not timid, so the blank needs a word for acting without hesitation. "Decisive" and "resolute" are near-synonyms and produce sentences alike in meaning, which is what this item type requires. "Forthright" is about candour rather than decisiveness, "cautious" contradicts both descriptions, and neither "ambiguous" nor "popular" has a partner here.'),

  ('verbal', 'Sentence equivalence', 'Equivalent completions', 'hard', 'multiple_response',
    'Reviewers who had expected a polemic were surprised by the book''s ______ tone, which weighs the opposing case more carefully than its own.',
    'Select the TWO answer choices that best complete the text and produce sentences alike in meaning.',
    '[{"id":"A","text":"strident"},{"id":"B","text":"measured"},{"id":"C","text":"temperate"},{"id":"D","text":"derivative"},{"id":"E","text":"cursory"},{"id":"F","text":"impassioned"}]',
    'B,C', 'The tone is surprising to readers expecting a polemic and it weighs the other side carefully, so it must be restrained. "Measured" and "temperate" are near-synonyms that both produce that sentence. "Strident" and "impassioned" are what a polemic sounds like, and "derivative" and "cursory" describe quality and thoroughness rather than tone -- and neither has a partner.'),

  ('verbal', 'Reading comprehension', 'Main idea', 'medium', 'multiple_choice',
    'The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.',
    'The primary purpose of the passage is to:',
    '[{"id":"A","text":"argue that the printing press had little effect on literacy"},{"id":"B","text":"complicate a standard causal account without wholly rejecting it"},{"id":"C","text":"compare literacy rates in towns with and without schools"},{"id":"D","text":"explain why early printers frequently went out of business"},{"id":"E","text":"describe the economics of press ownership in detail"}]',
    'B', 'The passage says the causation runs "the other way at least as often" -- not always -- and the final clause concedes that the press did enlarge its market once established. That is a complication rather than a rejection, which rules out A. The town comparison and the failed printers are evidence for the argument rather than the point of it.'),

  ('verbal', 'Reading comprehension', 'Inference', 'hard', 'multiple_choice',
    'The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.',
    'The passage suggests that a town with a press that failed quickly most likely:',
    '[{"id":"A","text":"had unusually high printing costs"},{"id":"B","text":"lacked an established reading public when the press arrived"},{"id":"C","text":"had banned printed material"},{"id":"D","text":"was located far from major trade routes"},{"id":"E","text":"had more presses than it could support"}]',
    'B', 'The passage pairs late arrival and frequent failure with towns lacking schools and a merchant class -- that is, lacking readers. Cost is described as uniformly high rather than variable by town, and bans, trade routes and oversupply are never mentioned.'),

  ('verbal', 'Reading comprehension', 'Function of a detail', 'medium', 'multiple_choice',
    'The standard account holds that the printing press caused the rapid spread of literacy. The sequence, though, runs the other way at least as often. Presses were expensive, and printers set up where a reading public already existed to buy what they printed. In towns with established schools and a merchant class that needed contracts read, presses arrived early and multiplied; in towns without, presses arrived late and frequently failed. The press did not create its market so much as follow it -- and then, having followed it, enlarge it.',
    'The mention that presses were expensive serves primarily to:',
    '[{"id":"A","text":"explain why printers needed an existing market before they could operate"},{"id":"B","text":"argue that printing was an unprofitable trade"},{"id":"C","text":"contrast printing with manuscript copying"},{"id":"D","text":"establish a chronology for the spread of the press"},{"id":"E","text":"suggest that literacy was a luxury"}]',
    'A', 'Cost is the mechanism of the argument: an expensive machine has to pay for itself, so a printer needs buyers before setting up. It is not offered as evidence that printing was unprofitable, and the passage draws no contrast with manuscripts and gives no chronology.'),

  ('verbal', 'Text completion', 'Single blank', 'medium', 'multiple_choice',
    'The results were widely reported as a breakthrough, though the authors themselves were careful to describe them as ______, pending replication in a larger sample.',
    'Select the word that best completes the text.',
    '[{"id":"A","text":"conclusive"},{"id":"B","text":"provisional"},{"id":"C","text":"unprecedented"},{"id":"D","text":"exhaustive"},{"id":"E","text":"controversial"}]',
    'B', 'The authors are contrasted with the reporting, and "pending replication" tells you what they meant: not yet settled. "Provisional" fits exactly. "Conclusive" and "exhaustive" both say the opposite, "unprecedented" is about novelty, and nothing in the sentence suggests dispute.'),

  ('verbal', 'Reading comprehension', 'Weaken', 'hard', 'multiple_choice',
    'A city reduced its speed limit on residential streets and reported a 22 percent fall in collisions the following year. Officials concluded that the lower limit caused the reduction.',
    'Which finding, if true, most weakens the officials'' conclusion?',
    '[{"id":"A","text":"Collisions fell by a similar amount in neighbouring cities that did not change their limits"},{"id":"B","text":"Some drivers exceeded the new limit"},{"id":"C","text":"The reduction was larger on some streets than on others"},{"id":"D","text":"The new limit was unpopular with commuters"},{"id":"E","text":"Enforcement of the limit increased slightly"}]',
    'A', 'If cities that changed nothing saw the same fall, the fall was produced by something affecting all of them and not by the policy -- that removes the causal link rather than merely qualifying it. Non-compliance and uneven effects are compatible with the policy working, unpopularity is irrelevant to whether it worked, and increased enforcement would if anything strengthen the case.'),

  -- ============== Quantitative Reasoning ==============

  ('quant', 'Arithmetic', 'Percentages', 'easy', 'multiple_choice',
    null,
    'A price is increased by 20 percent and then decreased by 20 percent. Compared with the original price, the final price is:',
    '[{"id":"A","text":"the same"},{"id":"B","text":"4 percent lower"},{"id":"C","text":"4 percent higher"},{"id":"D","text":"20 percent lower"},{"id":"E","text":"40 percent lower"}]',
    'B', 'The second percentage is taken of a larger number than the first, so the two do not cancel. Starting from 100: a 20 percent rise gives 120, and a 20 percent fall from 120 removes 24, leaving 96 -- 4 percent below the original. The general result is that successive equal rises and falls always end below where they started.'),

  ('quant', 'Algebra', 'Linear equations', 'easy', 'multiple_choice',
    null,
    'If 4x + 9 = 33, what is the value of 2x?',
    '[{"id":"A","text":"6"},{"id":"B","text":"12"},{"id":"C","text":"18"},{"id":"D","text":"24"},{"id":"E","text":"48"}]',
    'B', 'Subtracting 9 gives 4x = 24, so x = 6 and 2x = 12. The question asks for 2x rather than x, which is the standard way this exam catches a correct calculation that stops one step early -- choice A is the value of x.'),

  ('quant', 'Arithmetic', 'Ratios', 'medium', 'multiple_choice',
    null,
    'A mixture contains red and blue tokens in a ratio of 3 to 5. If there are 96 tokens in total, how many are blue?',
    '[{"id":"A","text":"36"},{"id":"B","text":"48"},{"id":"C","text":"56"},{"id":"D","text":"60"},{"id":"E","text":"64"}]',
    'D', 'The ratio has 3 + 5 = 8 parts, so each part is 96 / 8 = 12 tokens. Blue is 5 parts, or 60. Choice A is the number of red tokens, which is the answer to the question this one was designed to be misread as.'),

  ('quant', 'Data analysis', 'Statistics', 'medium', 'multiple_choice',
    'A data set contains the values 4, 7, 7, 9, and 23.',
    'Which statement about this data set is true?',
    '[{"id":"A","text":"The mean is less than the median"},{"id":"B","text":"The mean is greater than the median"},{"id":"C","text":"The mean equals the median"},{"id":"D","text":"The mode is greater than the mean"},{"id":"E","text":"The range is less than the mean"}]',
    'B', 'The median is the middle value of the sorted list, which is 7. The mean is (4 + 7 + 7 + 9 + 23) / 5 = 50 / 5 = 10. The single large value pulls the mean above the median without moving the median at all, which is the whole reason both measures exist.'),

  ('quant', 'Geometry', 'Circles', 'medium', 'multiple_choice',
    null,
    'A circle has an area of 36π. What is its circumference?',
    '[{"id":"A","text":"6π"},{"id":"B","text":"12π"},{"id":"C","text":"18π"},{"id":"D","text":"36π"},{"id":"E","text":"72π"}]',
    'B', 'Area is πr squared, so r squared = 36 and r = 6. Circumference is 2πr = 12π. Choice A takes the radius as the answer with a π attached, and choice D repeats the area.'),

  ('quant', 'Algebra', 'Exponents', 'medium', 'multiple_choice',
    null,
    'If 2^(x+3) = 32, what is the value of x?',
    '[{"id":"A","text":"1"},{"id":"B","text":"2"},{"id":"C","text":"3"},{"id":"D","text":"5"},{"id":"E","text":"8"}]',
    'B', 'Write 32 as a power of the same base: 32 = 2^5. With equal bases the exponents must be equal, so x + 3 = 5 and x = 2. Choice D is the exponent on the right-hand side, taken without subtracting the 3.'),

  ('quant', 'Data analysis', 'Probability', 'hard', 'multiple_choice',
    null,
    'Two fair six-sided dice are rolled. What is the probability that the sum is 7?',
    '[{"id":"A","text":"1/12"},{"id":"B","text":"1/9"},{"id":"C","text":"1/6"},{"id":"D","text":"1/4"},{"id":"E","text":"7/36"}]',
    'C', 'There are 36 equally likely outcomes, and six of them sum to 7: 1-6, 2-5, 3-4, 4-3, 5-2 and 6-1. That is 6/36, or 1/6. Counting 1-6 and 6-1 as one outcome gives 3/36 and choice A, which is the usual error -- the dice are distinguishable even when they look identical.'),

  ('quant', 'Algebra', 'Word problems', 'hard', 'student_produced_response',
    null,
    'A train travels 180 kilometres at a constant speed. If its speed had been 15 kilometres per hour faster, the journey would have taken 1 hour less. What was the train''s actual speed, in kilometres per hour?',
    null, '45', 'Let the speed be s. Then 180/s - 180/(s + 15) = 1. Multiplying through by s(s + 15) gives 180(s + 15) - 180s = s(s + 15), so 2700 = s squared + 15s. Solving s squared + 15s - 2700 = 0 factors as (s + 60)(s - 45) = 0, and speed cannot be negative, so s = 45.'),

  ('quant', 'Geometry', 'Triangles', 'hard', 'multiple_choice',
    null,
    'In a right triangle, one leg measures 8 and the hypotenuse measures 17. What is the area of the triangle?',
    '[{"id":"A","text":"30"},{"id":"B","text":"60"},{"id":"C","text":"68"},{"id":"D","text":"120"},{"id":"E","text":"136"}]',
    'B', 'The other leg is the square root of 17 squared minus 8 squared, which is the square root of 289 - 64 = 225, so 15. The area is half the product of the legs: (1/2)(8)(15) = 60. Choice D forgets the half, and choice C multiplies the given leg by the hypotenuse.'),

  ('quant', 'Data analysis', 'Interpreting data', 'medium', 'multiple_choice',
    'A company reports the following quarterly revenue, in millions of dollars:

Q1: 12
Q2: 15
Q3: 15
Q4: 18',
    'By what percent did revenue grow from Q1 to Q4?',
    '[{"id":"A","text":"6 percent"},{"id":"B","text":"33 percent"},{"id":"C","text":"50 percent"},{"id":"D","text":"60 percent"},{"id":"E","text":"150 percent"}]',
    'C', 'The increase is 18 - 12 = 6, and percent change is the increase over the ORIGINAL value: 6/12 = 0.5, or 50 percent. Choice B divides by the final value instead, and choice E reports the ratio of final to original rather than the change.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'gre'
on conflict (exam_id, md5(coalesce(stimulus, '') || chr(31) || question_text)) do nothing;

update public.exam_definitions
set status = 'available'
where slug = 'gre'
  and exists (
    select 1 from public.diagnostic_questions q
    where q.exam_id = exam_definitions.id and q.status = 'published'
  );
