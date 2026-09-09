-- Enough MCAT questions to actually sit a Quick Diagnostic.
--
-- The first MCAT bank landed 24 questions across four sections. The Quick
-- Diagnostic samples every section and needs 39, so lib/examModes.ts withheld
-- both modes and the exam page said "not enough questions yet" -- honest, and
-- useless. Meanwhile /exams still offered "Practise MCAT", because it was
-- deciding availability a different way. One of those screens had to change,
-- and the answer was both: this migration supplies the questions, and /exams
-- now reads the same availability logic the diagnostic does.
--
-- 19 more items, weighted to the sections that were thinnest, taking the bank
-- to 43 -- above the 39 a Quick Diagnostic samples, with margin so the
-- picker is choosing rather than serving everything it owns.
--
-- Same rules as the first batch. Every passage and item written for this
-- migration, none of it derived from an AAMC item, most of it passage-based
-- because that is what this exam is, and CARS carries no science at all.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  -- ============== Chemical and Physical Foundations (+4) ==============

  ('chem_phys', 'Thermodynamics and kinetics', 'Equilibrium', 'medium', 'multiple_choice',
    'A sealed vessel holds the equilibrium N2O4(g) reversibly forming 2 NO2(g), which is endothermic in the forward direction. N2O4 is colourless and NO2 is brown. The vessel is warmed from 25 to 60 degrees Celsius.',
    'What happens to the colour of the gas mixture, and why?',
    '[{"id":"A","text":"It darkens, because heating shifts an endothermic equilibrium toward products"},{"id":"B","text":"It lightens, because heating shifts an endothermic equilibrium toward reactants"},{"id":"C","text":"It darkens, because heating always increases the rate of the forward reaction only"},{"id":"D","text":"It is unchanged, because temperature does not affect an equilibrium position"}]',
    'A', 'Heat is a reactant in an endothermic reaction, so adding it drives the system toward products by Le Chatelier -- more NO2, darker colour. Choice C reaches the right answer by wrong reasoning: heating speeds both directions, and it is the shift in the equilibrium constant that matters. Choice D confuses a catalyst, which does not move an equilibrium, with temperature, which does.'),

  ('chem_phys', 'Molecular structure', 'Intermolecular forces', 'easy', 'multiple_choice',
    null,
    'Which molecule would be expected to have the highest boiling point?',
    '[{"id":"A","text":"CH4"},{"id":"B","text":"CH3CH3"},{"id":"C","text":"CH3OH"},{"id":"D","text":"CH3CH2CH3"}]',
    'C', 'Methanol is the only one with an O-H bond, so it is the only one that can hydrogen bond -- by far the strongest of the intermolecular forces here. The other three are held together by dispersion forces alone, which strengthen with size, so propane boils highest of those but still well below methanol despite being the largest molecule listed.'),

  ('chem_phys', 'Fluids and circulation', 'Pressure', 'medium', 'multiple_choice',
    'A patient is given an intravenous infusion from a bag suspended above the arm. The bag is raised from 0.5 m above the insertion point to 1.5 m.',
    'What happens to the pressure the fluid exerts at the insertion point?',
    '[{"id":"A","text":"It is unchanged, since the fluid and the tubing are the same"},{"id":"B","text":"It roughly triples, since hydrostatic pressure is proportional to height"},{"id":"C","text":"It roughly triples, since pressure is proportional to the square of the height"},{"id":"D","text":"It falls, since the fluid has further to travel"}]',
    'B', 'Hydrostatic pressure is rho times g times h, linear in height, so tripling the height triples that contribution. Choice C invents a square that is not in the relationship, and choice D confuses distance travelled with pressure -- the column of fluid is what pushes, and a taller column pushes harder.'),

  ('chem_phys', 'Atomic structure', 'Quantum numbers', 'hard', 'multiple_choice',
    null,
    'How many electrons in a single atom can share the quantum numbers n = 3 and l = 2?',
    '[{"id":"A","text":"2"},{"id":"B","text":"6"},{"id":"C","text":"10"},{"id":"D","text":"14"}]',
    'C', 'l = 2 is a d subshell, which has five orbitals (m from -2 to +2), and each orbital holds two electrons of opposite spin -- so ten. Choice A counts one orbital, B counts a p subshell and D an f subshell, which are the answers to the same question asked about l = 1 and l = 3.'),

  -- ============== Critical Analysis and Reasoning Skills (+5) ==============

  ('cars', 'Foundations of comprehension', 'Main idea', 'medium', 'multiple_choice',
    'We speak of a language dying as though it were an organism, and the metaphor does real damage. Organisms die of causes internal to them; languages are abandoned, and abandonment is a decision made under pressure by people who can usually name the pressure exactly. A speaker who stops teaching a language to their children is not watching a natural process. They are making a calculation about what their children will need, in conditions somebody else arranged. The metaphor of death converts that arrangement into weather.',
    'The central claim of the passage is that describing languages as dying:',
    '[{"id":"A","text":"understates how quickly languages disappear"},{"id":"B","text":"obscures the human decisions and pressures behind language loss"},{"id":"C","text":"is inaccurate because languages can always be revived"},{"id":"D","text":"discourages linguists from documenting endangered languages"}]',
    'B', 'The passage contrasts internal causes with decisions made under pressure "in conditions somebody else arranged", and closes by saying the metaphor converts that arrangement into weather -- that is, into something nobody chose. It makes no claim about speed, about revival, or about documentation.'),

  ('cars', 'Reasoning within the text', 'Function of a detail', 'hard', 'multiple_choice',
    'We speak of a language dying as though it were an organism, and the metaphor does real damage. Organisms die of causes internal to them; languages are abandoned, and abandonment is a decision made under pressure by people who can usually name the pressure exactly. A speaker who stops teaching a language to their children is not watching a natural process. They are making a calculation about what their children will need, in conditions somebody else arranged. The metaphor of death converts that arrangement into weather.',
    'The final sentence, comparing the arrangement to weather, primarily serves to:',
    '[{"id":"A","text":"suggest that language loss is seasonal and may reverse"},{"id":"B","text":"characterise the metaphor as making a human arrangement look like an impersonal force"},{"id":"C","text":"introduce climate as a genuine cause of language loss"},{"id":"D","text":"concede that some language loss really is beyond anyone''s control"}]',
    'B', 'Weather is the passage''s example of something that happens TO people rather than something people do, which is precisely the transformation it accuses the metaphor of performing. It is an image, not a claim about climate, and it concedes nothing -- the whole paragraph argues the opposite of choice D.'),

  ('cars', 'Reasoning beyond the text', 'Weaken', 'hard', 'multiple_choice',
    'We speak of a language dying as though it were an organism, and the metaphor does real damage. Organisms die of causes internal to them; languages are abandoned, and abandonment is a decision made under pressure by people who can usually name the pressure exactly. A speaker who stops teaching a language to their children is not watching a natural process. They are making a calculation about what their children will need, in conditions somebody else arranged. The metaphor of death converts that arrangement into weather.',
    'Which finding, if true, would most weaken the author''s argument?',
    '[{"id":"A","text":"Most speakers of abandoned languages report being unable to identify any pressure that led them to stop"},{"id":"B","text":"Language loss has accelerated over the past century"},{"id":"C","text":"Some abandoned languages have later been revived"},{"id":"D","text":"Linguists disagree about how many languages are currently endangered"}]',
    'A', 'The argument rests on abandonment being a nameable calculation made under identifiable pressure. Speakers who cannot identify any pressure would make the process look much more like the impersonal one the author is objecting to. Acceleration, revival and disagreement about counts are all compatible with the argument as stated.'),

  ('cars', 'Foundations of comprehension', 'Inference', 'medium', 'multiple_choice',
    'The first commercial lighthouse keepers were paid by the ship. A vessel passing safely would settle up at the next port, and a keeper whose light had guided nobody earned nothing. It was a system with an obvious flaw, and the flaw was not that keepers were poor. It was that a light, once lit, shines on every ship in the bay, including the ones that never pay. What the lighthouse taught economics was not how to run a lighthouse. It was that some goods cannot be sold one at a time.',
    'The passage implies that the payment system failed primarily because:',
    '[{"id":"A","text":"keepers could not afford to maintain their lights"},{"id":"B","text":"ships could benefit from the light without paying for it"},{"id":"C","text":"ports were unwilling to collect the fees"},{"id":"D","text":"too few ships passed to make the system viable"}]',
    'B', 'The passage names the flaw directly -- a lit light "shines on every ship in the bay, including the ones that never pay" -- and explicitly rules out poverty as the flaw in the sentence before. Ports and traffic volume are never mentioned.'),

  ('cars', 'Reasoning beyond the text', 'Application', 'hard', 'multiple_choice',
    'The first commercial lighthouse keepers were paid by the ship. A vessel passing safely would settle up at the next port, and a keeper whose light had guided nobody earned nothing. It was a system with an obvious flaw, and the flaw was not that keepers were poor. It was that a light, once lit, shines on every ship in the bay, including the ones that never pay. What the lighthouse taught economics was not how to run a lighthouse. It was that some goods cannot be sold one at a time.',
    'Which modern situation is most analogous to the problem the passage describes?',
    '[{"id":"A","text":"A newspaper charging more for a print edition than a digital one"},{"id":"B","text":"A neighbourhood association funding street lighting that benefits non-members equally"},{"id":"C","text":"A shop raising prices when a competitor closes"},{"id":"D","text":"An airline overbooking a flight to account for no-shows"}]',
    'B', 'The structure is a good that, once provided, cannot be withheld from those who did not pay -- which is exactly street lighting funded by some and used by all. Pricing tiers, monopoly pricing and overbooking are all problems of allocating a good that CAN be withheld.'),

  -- ============== Biological and Biochemical Foundations (+5) ==============

  ('bio_biochem', 'Molecular biology', 'Mutation', 'medium', 'multiple_choice',
    'A single nucleotide is deleted from the coding region of a gene, 40 codons upstream of the stop codon.',
    'What is the most likely consequence for the protein product?',
    '[{"id":"A","text":"One amino acid is substituted and the rest of the protein is unchanged"},{"id":"B","text":"The reading frame shifts, so most residues after the deletion are wrong"},{"id":"C","text":"The protein is unchanged, because the genetic code is redundant"},{"id":"D","text":"Translation fails to begin at all"}]',
    'B', 'Codons are read in non-overlapping threes from a fixed start, so deleting one base shifts every codon after it -- a frameshift, which typically also produces a premature stop. Choice A describes a point substitution, choice C describes a silent mutation at the wobble position, and neither applies to an indel. The start codon is untouched, so translation still begins.'),

  ('bio_biochem', 'Metabolism', 'Regulation', 'hard', 'multiple_choice',
    'Phosphofructokinase-1 catalyses an early, effectively irreversible step of glycolysis. It is inhibited by ATP and by citrate, and activated by AMP.',
    'What does this regulation pattern most directly accomplish?',
    '[{"id":"A","text":"It matches glycolytic flux to the cell''s energy demand"},{"id":"B","text":"It prevents glucose from entering the cell when ATP is high"},{"id":"C","text":"It ensures glycolysis runs at a constant rate regardless of conditions"},{"id":"D","text":"It couples glycolysis directly to protein synthesis"}]',
    'A', 'ATP and citrate both signal that energy and carbon are plentiful and shut the pathway down; AMP signals that ATP has been spent and opens it up. Regulating an early irreversible step is how a pathway is throttled without wasting intermediates. Choice B describes transport rather than this enzyme, and choice C is the opposite of what feedback regulation does.'),

  ('bio_biochem', 'Cell biology', 'Protein trafficking', 'medium', 'multiple_choice',
    null,
    'A protein destined for secretion is synthesised on ribosomes attached to which structure?',
    '[{"id":"A","text":"The smooth endoplasmic reticulum"},{"id":"B","text":"The rough endoplasmic reticulum"},{"id":"C","text":"The mitochondrial outer membrane"},{"id":"D","text":"The nuclear envelope inner membrane"}]',
    'B', 'A signal sequence directs the ribosome to the rough ER, where the growing chain is threaded into the lumen and enters the secretory pathway to the Golgi. The smooth ER is named for having no ribosomes and handles lipid synthesis and detoxification, which is what makes choice A the tempting near-miss.'),

  ('bio_biochem', 'Enzymes', 'Cooperativity', 'hard', 'multiple_choice',
    'Haemoglobin binds oxygen with a sigmoidal saturation curve; myoglobin binds it with a hyperbolic one.',
    'What does the sigmoidal shape of the haemoglobin curve indicate?',
    '[{"id":"A","text":"Haemoglobin has a higher affinity for oxygen than myoglobin at every partial pressure"},{"id":"B","text":"Binding at one site increases the affinity of the remaining sites"},{"id":"C","text":"Haemoglobin is denatured at low oxygen partial pressures"},{"id":"D","text":"Haemoglobin binds only one oxygen molecule per protein"}]',
    'B', 'A sigmoidal curve is the signature of positive cooperativity: the first oxygen bound shifts the protein toward a higher-affinity state, so the middle of the curve is steep. That steepness is what lets haemoglobin load in the lungs and unload in tissue. Myoglobin has one site and so cannot cooperate, which is why its curve is hyperbolic and its affinity is higher, not lower.'),

  ('bio_biochem', 'Genetics', 'Population genetics', 'medium', 'multiple_choice',
    'In a large population at Hardy-Weinberg equilibrium, a recessive condition affects 1 in 400 individuals.',
    'What proportion of the population are carriers?',
    '[{"id":"A","text":"About 1 in 400"},{"id":"B","text":"About 1 in 40"},{"id":"C","text":"About 1 in 20"},{"id":"D","text":"About 1 in 10"}]',
    'D', 'q squared = 1/400, so q = 1/20 and p is about 19/20. Carriers are 2pq, which is 2 times 19/20 times 1/20, or about 0.095 -- close to 1 in 10. Choice C reports q itself rather than the carrier frequency, which is the standard error on this calculation.'),

  -- ============== Psychological, Social, and Biological Foundations (+5) ==============

  ('psych_soc', 'Learning and memory', 'Memory systems', 'medium', 'multiple_choice',
    'A patient with bilateral hippocampal damage can learn to trace a shape in a mirror, improving over days, but has no memory of ever having practised the task.',
    'What does this pattern most directly demonstrate?',
    '[{"id":"A","text":"Procedural and declarative memory rely on different systems"},{"id":"B","text":"Working memory capacity is unaffected by hippocampal damage"},{"id":"C","text":"Motor skills are stored in the hippocampus"},{"id":"D","text":"Memory consolidation requires sleep"}]',
    'A', 'The skill improves while the episodic record of practising it does not form, which is only possible if the two are supported by separate systems -- procedural learning through the basal ganglia and cerebellum, declarative memory through the hippocampus. Choice C is contradicted by the very fact the patient improves.'),

  ('psych_soc', 'Social psychology', 'Group behaviour', 'medium', 'multiple_choice',
    'Participants were asked to pull on a rope, alone and in groups. Individual force decreased as group size increased, even though participants reported trying equally hard throughout.',
    'This finding is best explained by:',
    '[{"id":"A","text":"social facilitation"},{"id":"B","text":"social loafing"},{"id":"C","text":"deindividuation"},{"id":"D","text":"group polarisation"}]',
    'B', 'Reduced individual effort on a collective task where contributions cannot be separated is social loafing. Social facilitation is the opposite -- improved performance when observed -- deindividuation is loss of self-awareness in a crowd, and group polarisation is about attitudes becoming more extreme after discussion.'),

  ('psych_soc', 'Biological bases of behaviour', 'Endocrine', 'hard', 'multiple_choice',
    'Cortisol released from the adrenal cortex inhibits the release of both corticotropin-releasing hormone from the hypothalamus and adrenocorticotropic hormone from the anterior pituitary.',
    'This arrangement is an example of:',
    '[{"id":"A","text":"positive feedback"},{"id":"B","text":"negative feedback"},{"id":"C","text":"feedforward regulation"},{"id":"D","text":"a reflex arc"}]',
    'B', 'The end product of the axis suppresses the signals that produced it, which damps the response and holds the system near a set point -- the definition of negative feedback. Positive feedback would amplify instead, which physiology reserves for processes meant to run to completion, such as labour or clotting.'),

  ('psych_soc', 'Sociology', 'Social stratification', 'medium', 'multiple_choice',
    null,
    'A researcher finds that children of parents in the highest income quintile are far more likely to remain in that quintile as adults than chance would predict. This finding is best described as evidence of:',
    '[{"id":"A","text":"low intergenerational mobility"},{"id":"B","text":"high intergenerational mobility"},{"id":"C","text":"absolute poverty"},{"id":"D","text":"the Hawthorne effect"}]',
    'A', 'Position persisting across generations is exactly what low mobility means -- where you end up is strongly predicted by where you started. High mobility would show the opposite. Absolute poverty is a threshold measure rather than a movement one, and the Hawthorne effect concerns behaviour changing under observation.'),

  ('psych_soc', 'Sensation and perception', 'Visual processing', 'hard', 'multiple_choice',
    'A person can accurately reach for and grasp an object placed in front of them but cannot report its shape or orientation when asked.',
    'This dissociation is most consistent with damage to which pathway?',
    '[{"id":"A","text":"The dorsal stream, leaving the ventral stream intact"},{"id":"B","text":"The ventral stream, leaving the dorsal stream intact"},{"id":"C","text":"The optic nerve before the chiasm"},{"id":"D","text":"The primary auditory cortex"}]',
    'B', 'The ventral stream supports recognition -- what an object is -- and the dorsal stream supports visually guided action -- where it is and how to reach it. Action preserved with recognition lost points to ventral damage. Choice A has it backwards, and damage before the chiasm would produce a field loss rather than this dissociation.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'mcat'
on conflict (exam_id, md5(coalesce(stimulus, '') || E'\x1f' || question_text)) do nothing;
