-- An original MCAT-style question bank.
--
-- Every passage and every item was written for this migration. None of it
-- reproduces, paraphrases or is derived from an AAMC item. What is taken
-- from the AAMC is the published content outline: the four sections, the
-- foundational concepts they examine, and the fact that most of the exam is
-- passage-based rather than discrete.
--
-- That last part is the design constraint here, and the brief for this work
-- said it in as many words: do not turn the MCAT into isolated trivia. So
-- most items below carry a passage -- an experiment with a result to
-- interpret, a table to read, an argument to evaluate -- and the question
-- asks the student to do something with it rather than to recall a fact
-- that happens to be nearby.
--
-- Passages are stored on each item rather than in a table of their own,
-- which looks like duplication and is deliberate: the bank picker selects
-- items independently, so two questions from one passage will usually not
-- appear together, and an item that cannot be answered without a sibling it
-- may never be shown alongside is a broken item. Each one here stands alone
-- with its passage.
--
-- CARS items carry no science at all, by design. The section tests reading,
-- and a CARS item that rewards outside knowledge is testing the wrong thing.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  -- ============== Chemical and Physical Foundations ==============

  ('chem_phys', 'Thermodynamics and kinetics', 'Reaction energetics', 'medium', 'multiple_choice',
    'Researchers measured the rate of an enzyme-catalyzed reaction at several temperatures. Rate rose steadily from 20 to 40 degrees Celsius, peaked near 42 degrees, then fell sharply, reaching almost zero by 60 degrees. A parallel run with the same reactants and no enzyme showed rate rising steadily across the entire range.',
    'Which explanation best accounts for the difference between the two runs above 45 degrees Celsius?',
    '[{"id":"A","text":"The uncatalysed reaction has a lower activation energy at high temperature"},{"id":"B","text":"The enzyme denatures, removing the catalyzed pathway, while the uncatalysed reaction continues to speed up"},{"id":"C","text":"The reactants are consumed faster in the catalyzed run"},{"id":"D","text":"The equilibrium constant of the catalyzed reaction decreases with temperature"}]',
    'B', 'Rate rises with temperature for any reaction because more collisions clear the activation barrier. An enzyme adds a lower-barrier pathway, but it is a protein and loses its tertiary structure above its optimum, which removes that pathway entirely. Choice A inverts the definition of a catalyst; choice C would affect both runs; and a change in equilibrium constant describes where the reaction ends up, not how fast it gets there.'),

  ('chem_phys', 'Thermodynamics and kinetics', 'Catalysis', 'medium', 'multiple_choice',
    'Researchers measured the rate of an enzyme-catalyzed reaction at several temperatures. Rate rose steadily from 20 to 40 degrees Celsius, peaked near 42 degrees, then fell sharply, reaching almost zero by 60 degrees. A parallel run with the same reactants and no enzyme showed rate rising steadily across the entire range.',
    'Compared with the uncatalysed reaction at 30 degrees Celsius, the catalyzed reaction has:',
    '[{"id":"A","text":"a lower activation energy and the same overall free energy change"},{"id":"B","text":"a lower activation energy and a more negative free energy change"},{"id":"C","text":"the same activation energy and a more negative free energy change"},{"id":"D","text":"a higher activation energy and the same free energy change"}]',
    'A', 'A catalyst lowers the activation barrier and is unchanged at the end, so it alters the path and not the endpoints. The free energy change is a state function fixed by the reactants and products, which is why a catalyst can never make an unfavourable reaction favourable -- only faster.'),

  ('chem_phys', 'Acids and bases', 'Buffers', 'medium', 'multiple_choice',
    'A buffer is prepared containing 0.10 M of a weak acid HA and 0.10 M of its conjugate base A-. The acid has a pKa of 4.8. A small volume of strong base is then added.',
    'What happens to the pH of the solution immediately after the strong base is added?',
    '[{"id":"A","text":"It falls sharply, because the base consumes A-"},{"id":"B","text":"It rises slightly, because HA neutralises most of the added base"},{"id":"C","text":"It rises sharply, because the buffer has no capacity at equal concentrations"},{"id":"D","text":"It does not change at all, because buffers hold pH exactly constant"}]',
    'B', 'Added strong base is consumed by the weak acid HA, converting some of it to A-. That shifts the ratio of base to acid slightly upward, so the pH rises slightly rather than sharply. Buffer capacity is at its maximum when the two are equal, which is the opposite of choice C, and no buffer holds pH exactly constant -- it resists change rather than preventing it.'),

  ('chem_phys', 'Acids and bases', 'pH calculation', 'hard', 'multiple_choice',
    'A buffer is prepared containing 0.10 M of a weak acid HA and 0.10 M of its conjugate base A-. The acid has a pKa of 4.8.',
    'What is the pH of the buffer before any base is added?',
    '[{"id":"A","text":"1.0"},{"id":"B","text":"4.8"},{"id":"C","text":"7.0"},{"id":"D","text":"9.2"}]',
    'B', 'The Henderson-Hasselbalch equation gives pH = pKa + log([A-]/[HA]). With equal concentrations the ratio is 1, its logarithm is 0, and the pH equals the pKa exactly. This is the single most useful fact about buffers: at the half-equivalence point, pH and pKa are the same number.'),

  ('chem_phys', 'Fluids and circulation', 'Flow', 'hard', 'multiple_choice',
    'A rigid tube carries an incompressible fluid at steady flow. Partway along its length the tube narrows to half its original radius before widening again.',
    'In the narrowed region, compared with the wide region, the fluid has:',
    '[{"id":"A","text":"a higher speed and a lower pressure"},{"id":"B","text":"a higher speed and a higher pressure"},{"id":"C","text":"a lower speed and a lower pressure"},{"id":"D","text":"a lower speed and a higher pressure"}]',
    'A', 'Continuity requires that the same volume pass every cross-section per second, so halving the radius quarters the area and quadruples the speed. Bernoulli then requires that the faster region be at lower pressure, since the total energy per unit volume is conserved. The intuition that a squeeze raises pressure is the trap, and it is the reason this appears on every version of this exam.'),

  ('chem_phys', 'Electrochemistry', 'Redox', 'medium', 'multiple_choice',
    'In an electrochemical cell, zinc metal is oxidised at one electrode and copper ions are reduced at the other, producing a measurable voltage.',
    'At which electrode does oxidation occur, and what happens to the mass of that electrode over time?',
    '[{"id":"A","text":"The cathode; its mass increases"},{"id":"B","text":"The cathode; its mass decreases"},{"id":"C","text":"The anode; its mass increases"},{"id":"D","text":"The anode; its mass decreases"}]',
    'D', 'Oxidation always occurs at the anode -- the two words share a vowel, which is the standard mnemonic. Zinc atoms lose electrons and leave the electrode as ions in solution, so the zinc electrode loses mass while the copper cathode gains it as copper ions plate out.'),

  ('chem_phys', 'Atomic structure', 'Periodic trends', 'easy', 'multiple_choice',
    null,
    'Which of the following correctly describes the trend in first ionisation energy across a period from left to right?',
    '[{"id":"A","text":"It decreases, because atomic radius increases"},{"id":"B","text":"It increases, because effective nuclear charge increases"},{"id":"C","text":"It stays constant, because the number of shells does not change"},{"id":"D","text":"It decreases, because electron shielding increases"}]',
    'B', 'Across a period, protons are added to the nucleus while electrons enter the same shell, so shielding barely changes and the effective nuclear charge felt by an outer electron rises. The atom holds its electrons more tightly, so more energy is needed to remove one. Radius decreases across a period, which is the opposite of what choice A assumes.'),

  -- ============== Biological and Biochemical Foundations ==============

  ('bio_biochem', 'Enzymes', 'Inhibition', 'hard', 'multiple_choice',
    'An enzyme was assayed at a range of substrate concentrations, with and without an added compound X. Without X, the apparent Km was 4 micromolar and Vmax was 100 units. With X present, the apparent Km rose to 12 micromolar while Vmax remained 100 units.',
    'What type of inhibition does compound X most likely exhibit?',
    '[{"id":"A","text":"Competitive"},{"id":"B","text":"Noncompetitive"},{"id":"C","text":"Uncompetitive"},{"id":"D","text":"Irreversible"}]',
    'A', 'A competitive inhibitor binds the active site and can be outcompeted by enough substrate, so Vmax is unchanged while the substrate concentration needed to reach half of it rises -- exactly the pattern here. Noncompetitive inhibition lowers Vmax with Km unchanged, uncompetitive lowers both, and irreversible inhibition lowers Vmax by permanently removing enzyme.'),

  ('bio_biochem', 'Enzymes', 'Kinetics', 'medium', 'multiple_choice',
    'An enzyme was assayed at a range of substrate concentrations, with and without an added compound X. Without X, the apparent Km was 4 micromolar and Vmax was 100 units. With X present, the apparent Km rose to 12 micromolar while Vmax remained 100 units.',
    'Which experimental change would most directly test the proposed mechanism of compound X?',
    '[{"id":"A","text":"Repeating the assay at a much higher substrate concentration"},{"id":"B","text":"Repeating the assay at a lower enzyme concentration"},{"id":"C","text":"Measuring the molecular weight of compound X"},{"id":"D","text":"Repeating the assay at a lower temperature"}]',
    'A', 'The claim is that X competes for the active site, and the definitive prediction of that claim is that enough substrate should outcompete it and restore the uninhibited rate. Lowering enzyme concentration scales everything down without discriminating between mechanisms, and neither molecular weight nor temperature tests where X binds.'),

  ('bio_biochem', 'Metabolism', 'Cellular respiration', 'medium', 'multiple_choice',
    'A cell culture is treated with a compound that makes the inner mitochondrial membrane freely permeable to protons. Oxygen consumption rises, but ATP production falls sharply.',
    'Which explanation best accounts for this result?',
    '[{"id":"A","text":"The electron transport chain is inhibited, so less oxygen is used"},{"id":"B","text":"The proton gradient is dissipated, so ATP synthase cannot use it, while electron transport runs unopposed"},{"id":"C","text":"Glycolysis is inhibited, so no substrate reaches the mitochondrion"},{"id":"D","text":"ATP synthase is running in reverse, hydrolysing ATP to pump protons"}]',
    'B', 'This is an uncoupler. Electron transport builds a proton gradient and ATP synthase spends it; making the membrane leaky removes the gradient, so ATP synthesis fails while the chain runs faster than ever with nothing backing it up -- which is why oxygen consumption rises. Choice A contradicts the rise in oxygen use, and the energy released appears as heat.'),

  ('bio_biochem', 'Molecular biology', 'Gene expression', 'medium', 'multiple_choice',
    'A bacterial operon encoding enzymes for lactose metabolism is transcribed only when lactose is present and glucose is absent.',
    'Which mechanism best explains why the operon is silent when both sugars are present?',
    '[{"id":"A","text":"The repressor remains bound to the operator"},{"id":"B","text":"Catabolite repression keeps cyclic AMP low, so the activator does not bind"},{"id":"C","text":"The structural genes are deleted in the presence of glucose"},{"id":"D","text":"Ribosomes cannot translate the mRNA when glucose is present"}]',
    'B', 'Lactose releases the repressor, so the operator is free -- but transcription still needs the cAMP-bound activator, and glucose keeps cAMP low. The system is a logical AND, and glucose fails the second condition rather than the first, which is what makes choice A the tempting wrong answer.'),

  ('bio_biochem', 'Cell biology', 'Membrane transport', 'easy', 'multiple_choice',
    null,
    'A cell is placed in a solution with a lower solute concentration than its cytoplasm. What happens?',
    '[{"id":"A","text":"Water leaves the cell and it shrinks"},{"id":"B","text":"Water enters the cell and it swells"},{"id":"C","text":"Solute enters the cell down its gradient until concentrations equalise"},{"id":"D","text":"Nothing, because the membrane is impermeable to water"}]',
    'B', 'Water moves toward the higher solute concentration, which here is inside, so the cell takes up water and swells -- the solution is hypotonic to the cell. Choice C describes what would happen if the membrane were freely permeable to the solute, which is usually the point of the question, and aquaporins make choice D false for essentially every cell.'),

  ('bio_biochem', 'Genetics', 'Inheritance', 'hard', 'multiple_choice',
    'A recessive condition appears in a child whose parents are both unaffected. Neither set of grandparents was affected.',
    'What is the probability that a second child of the same parents will be affected?',
    '[{"id":"A","text":"0"},{"id":"B","text":"1 in 4"},{"id":"C","text":"1 in 2"},{"id":"D","text":"3 in 4"}]',
    'B', 'An affected child of two unaffected parents means both parents are carriers, so the cross is Aa by Aa and one quarter of offspring are affected. Each conception is independent, so having had one affected child does not change the odds for the next -- the belief that it does is the commonest error on pedigree questions.'),

  -- ============== Psychological, Social, and Biological Foundations ==============

  ('psych_soc', 'Learning and memory', 'Conditioning', 'medium', 'multiple_choice',
    'In a study, participants heard a tone immediately before receiving a mild puff of air to the eye. After many pairings, participants blinked when the tone was played alone.',
    'In this experiment, the tone is best described as:',
    '[{"id":"A","text":"an unconditioned stimulus"},{"id":"B","text":"a conditioned stimulus"},{"id":"C","text":"an unconditioned response"},{"id":"D","text":"a negative reinforcer"}]',
    'B', 'The air puff produces a blink without any learning, which makes it the unconditioned stimulus. The tone started neutral and acquired its power through pairing, which is the definition of a conditioned stimulus. Reinforcement belongs to operant conditioning, where behavior is emitted rather than elicited.'),

  ('psych_soc', 'Learning and memory', 'Extinction', 'hard', 'multiple_choice',
    'In a study, participants heard a tone immediately before receiving a mild puff of air to the eye. After many pairings, participants blinked when the tone was played alone. The tone was then presented alone repeatedly, and blinking gradually stopped. After a day away, the tone was presented again and weak blinking returned.',
    'The return of blinking after the delay is best described as:',
    '[{"id":"A","text":"spontaneous recovery"},{"id":"B","text":"stimulus generalisation"},{"id":"C","text":"second-order conditioning"},{"id":"D","text":"habituation"}]',
    'A', 'Extinction suppresses a conditioned response rather than erasing the association, and the response can reappear after a rest interval -- that reappearance is spontaneous recovery. Generalisation is responding to a similar but different stimulus, second-order conditioning builds a new association on an existing one, and habituation is a decline in response to a repeated harmless stimulus with no pairing involved.'),

  ('psych_soc', 'Social psychology', 'Attribution', 'medium', 'multiple_choice',
    'A driver is cut off in traffic and immediately concludes that the other driver is reckless and inconsiderate. Later the same day, the driver cuts someone off while rushing to a hospital, and attributes it to the emergency.',
    'This pattern is best described as:',
    '[{"id":"A","text":"the fundamental attribution error, applied asymmetrically to self and other"},{"id":"B","text":"cognitive dissonance"},{"id":"C","text":"the just-world hypothesis"},{"id":"D","text":"groupthink"}]',
    'A', 'Explaining someone else''s behavior by their character while explaining one''s own by the situation is the actor-observer asymmetry of the fundamental attribution error. Dissonance is the discomfort of holding conflicting beliefs, the just-world hypothesis is the belief that people get what they deserve, and groupthink is a failure of group decision-making.'),

  ('psych_soc', 'Biological bases of behavior', 'Neurotransmission', 'medium', 'multiple_choice',
    'A drug blocks the reuptake transporter for a particular neurotransmitter at the synapse.',
    'What is the most direct consequence of this action?',
    '[{"id":"A","text":"Less neurotransmitter is released into the synapse"},{"id":"B","text":"The neurotransmitter remains in the synaptic cleft longer"},{"id":"C","text":"Postsynaptic receptors are destroyed"},{"id":"D","text":"The action potential travels faster along the axon"}]',
    'B', 'Reuptake is how a released transmitter is cleared from the cleft, so blocking it leaves the transmitter available to bind receptors for longer and prolongs the signal. Release is presynaptic and unaffected, receptors are not destroyed, and axonal conduction speed depends on myelination and diameter rather than on synaptic clearance.'),

  ('psych_soc', 'Sociology', 'Research methods', 'hard', 'multiple_choice',
    'A survey finds that neighborhoods with more parks report better self-rated health. The researchers conclude that building parks improves health.',
    'Which is the strongest objection to that conclusion?',
    '[{"id":"A","text":"The sample size was too small to detect an effect"},{"id":"B","text":"Wealthier neighborhoods may have both more parks and better health for other reasons"},{"id":"C","text":"Self-rated health is not a valid construct"},{"id":"D","text":"Parks are not the only kind of green space"}]',
    'B', 'The study is observational, so the association could be produced entirely by a third variable that causes both -- income being the obvious candidate. That is confounding, and it is the objection that undermines the causal claim rather than merely qualifying it. Sample size affects precision, not causal direction, and the other two narrow the finding without challenging its logic.'),

  ('psych_soc', 'Sensation and perception', 'Thresholds', 'easy', 'multiple_choice',
    null,
    'The smallest difference between two stimuli that a person can reliably detect is called the:',
    '[{"id":"A","text":"absolute threshold"},{"id":"B","text":"just-noticeable difference"},{"id":"C","text":"sensory adaptation point"},{"id":"D","text":"signal detection criterion"}]',
    'B', 'The just-noticeable difference is the smallest detectable change between two stimuli, while the absolute threshold is the smallest detectable stimulus in the first place. Sensory adaptation is a decline in response to a constant stimulus, and the detection criterion is how willing an observer is to say they noticed something.'),

  -- ============== Critical Analysis and Reasoning Skills ==============
  -- No science in these, by design. The section tests reading, and an item
  -- that rewards outside knowledge is testing the wrong thing.

  ('cars', 'Foundations of comprehension', 'Main idea', 'medium', 'multiple_choice',
    'Restoration is usually described as returning a building to how it looked at some earlier moment. But every building has had many moments, and choosing one is an argument rather than a discovery. The restorer who strips a Victorian church back to its medieval fabric has not uncovered the true building; they have decided that six centuries of use were an interruption. That decision may be defensible. What it is not is neutral, and the language of restoration -- returning, uncovering, revealing -- works hard to make it sound as though no decision was made at all.',
    'The main idea of the passage is that restoration:',
    '[{"id":"A","text":"should generally be avoided in favour of preservation"},{"id":"B","text":"involves a choice that its own vocabulary tends to conceal"},{"id":"C","text":"is impossible to carry out accurately on medieval buildings"},{"id":"D","text":"has improved as techniques have become more precise"}]',
    'B', 'The passage argues that picking which moment to restore to is an argument, and that words like "uncovering" disguise it as a discovery. It explicitly allows that the decision "may be defensible", so it is not arguing against restoration -- which rules out A -- and it makes no claim about accuracy or about improvement over time.'),

  ('cars', 'Reasoning within the text', 'Author attitude', 'hard', 'multiple_choice',
    'Restoration is usually described as returning a building to how it looked at some earlier moment. But every building has had many moments, and choosing one is an argument rather than a discovery. The restorer who strips a Victorian church back to its medieval fabric has not uncovered the true building; they have decided that six centuries of use were an interruption. That decision may be defensible. What it is not is neutral, and the language of restoration -- returning, uncovering, revealing -- works hard to make it sound as though no decision was made at all.',
    'The author''s attitude towards restorers is best described as:',
    '[{"id":"A","text":"dismissive of their expertise"},{"id":"B","text":"critical of the vocabulary they work within rather than of their competence"},{"id":"C","text":"admiring of their commitment to historical accuracy"},{"id":"D","text":"indifferent to the outcomes of their work"}]',
    'B', 'The sentence "That decision may be defensible" concedes the work can be right, and the complaint is aimed squarely at the language, which "works hard" to hide a choice. Nothing questions the restorers'' skill, nothing admires them, and an indifferent author does not write the final sentence.'),

  ('cars', 'Reasoning beyond the text', 'Application', 'hard', 'multiple_choice',
    'Restoration is usually described as returning a building to how it looked at some earlier moment. But every building has had many moments, and choosing one is an argument rather than a discovery. The restorer who strips a Victorian church back to its medieval fabric has not uncovered the true building; they have decided that six centuries of use were an interruption. That decision may be defensible. What it is not is neutral, and the language of restoration -- returning, uncovering, revealing -- works hard to make it sound as though no decision was made at all.',
    'Which situation is most analogous to the author''s central concern?',
    '[{"id":"A","text":"A museum labeling a reconstructed vase as an original"},{"id":"B","text":"An editor calling a heavily rewritten manuscript the author''s definitive text"},{"id":"C","text":"A conservationist removing an invasive species from a wetland"},{"id":"D","text":"A translator producing two versions of a poem for different audiences"}]',
    'B', 'The concern is that a word implies a single true version was recovered when in fact one was chosen from many. "Definitive" does exactly that work for a manuscript with many states. The vase case is straightforward misrepresentation rather than a concealed choice; the wetland has an uncontested baseline; and the translator with two versions is being openly plural, which is the opposite of the complaint.'),

  ('cars', 'Foundations of comprehension', 'Inference', 'medium', 'multiple_choice',
    'For most of its history the word "amateur" carried no insult. It named someone who did a thing for love of it, and it was used approvingly of the naturalists, astronomers and archaeologists who did much of the observing that professionals later systematised. The shift came with the professions themselves, which needed a word for everyone outside them, and found one ready to hand. What changed was not the amateurs. It was who got to define competence.',
    'The passage suggests that the word "amateur" acquired its negative sense primarily because:',
    '[{"id":"A","text":"amateurs began producing lower-quality work"},{"id":"B","text":"professional groups needed a term for those outside them"},{"id":"C","text":"the activities themselves became more technically demanding"},{"id":"D","text":"the word was mistranslated from its original language"}]',
    'B', 'The passage says the shift came with the professions, which "needed a word for everyone outside them", and then states directly that what changed was not the amateurs. Choices A and C both locate the change in the amateurs or the work, which the final two sentences rule out.'),

  ('cars', 'Reasoning within the text', 'Argument structure', 'medium', 'multiple_choice',
    'For most of its history the word "amateur" carried no insult. It named someone who did a thing for love of it, and it was used approvingly of the naturalists, astronomers and archaeologists who did much of the observing that professionals later systematised. The shift came with the professions themselves, which needed a word for everyone outside them, and found one ready to hand. What changed was not the amateurs. It was who got to define competence.',
    'The examples of naturalists, astronomers and archaeologists function primarily to:',
    '[{"id":"A","text":"establish that the word once described people doing serious work"},{"id":"B","text":"argue that these three fields were unusually welcoming to outsiders"},{"id":"C","text":"contrast scientific amateurs with artistic ones"},{"id":"D","text":"show that professional standards were low at the time"}]',
    'A', 'The list supports the claim in the first sentence by naming amateurs whose work professionals later built on, which is what makes the later insult worth remarking on. It draws no contrast between fields, mentions no artistic amateurs, and says nothing about professional standards.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'mcat'
on conflict (exam_id, md5(coalesce(stimulus, '') || E'\x1f' || question_text)) do nothing;

update public.exam_definitions
set status = 'available'
where slug = 'mcat'
  and exists (
    select 1 from public.diagnostic_questions q
    where q.exam_id = exam_definitions.id and q.status = 'published'
  );
