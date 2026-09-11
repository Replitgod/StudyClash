// An original JEE Main question bank.
//
// Every item was written for this file. Nothing reproduces, paraphrases or
// is derived from an NTA paper -- past JEE papers are copyrighted and the
// copies circulating online are not licensed material. What is taken from
// the NTA is the published pattern (25 items per subject, 20 multiple choice
// and 5 numerical, +4/-1) and the NCERT syllabus those items are drawn from.
//
// Two constraints shaped the content:
//
// Every answer here is checkable by hand in under a minute. That is
// deliberate -- an item whose key I cannot verify from first principles is
// an item I should not be shipping to someone sitting an engineering
// entrance exam. The numbers are chosen to come out clean for the same
// reason.
//
// Distractors are wrong ANSWERS, not wrong topics. Each one is where a
// specific, common error lands: forgetting to resolve a component, using
// diameter for radius, dropping a factor of two from an integral. A
// distractor nobody would pick is a wasted option and turns a four-option
// item into a two-option one.

export type BankItem = {
  section: string;
  domain: string;
  skill: string;
  difficulty: "easy" | "medium" | "hard";
  stimulus: string | null;
  questionText: string;
  choices: { id: string; text: string }[];
  correct: string;
  explanation: string;
};

const mc = (...texts: string[]) =>
  texts.map((text, i) => ({ id: "ABCD"[i], text }));

export const JEE_MAIN: BankItem[] = [
  /* ----------------------------------------------------------- Physics */
  {
    section: "physics",
    domain: "Kinematics",
    skill: "Projectile motion",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "A ball is thrown at 20 m/s at 30 degrees above the horizontal. Taking g as 10 m/s squared, what is the maximum height it reaches?",
    choices: mc("5 m", "10 m", "20 m", "2.5 m"),
    correct: "A",
    explanation:
      "Only the vertical component decides the height. It is 20 sin 30, which is 10 m/s, and the ball rises until that is spent: h equals v squared over 2g, so 100 over 20, which is 5 m. Choosing 20 m is what happens if you use the full 20 m/s instead of resolving it first -- the single most common slip on this item type.",
  },
  {
    section: "physics",
    domain: "Laws of motion",
    skill: "Motion on an incline",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "A block slides down a frictionless incline of 30 degrees. Taking g as 10 m/s squared, what is its acceleration along the incline?",
    choices: mc("5 m/s squared", "10 m/s squared", "8.7 m/s squared", "Zero"),
    correct: "A",
    explanation:
      "The component of gravity along the surface is g sin theta, so 10 times 0.5, which is 5 m/s squared. The 8.7 option is g cos 30 -- the component pressing into the surface, which the normal force cancels and which never drives the slide.",
  },
  {
    section: "physics",
    domain: "Work, energy and power",
    skill: "Work-energy theorem",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "A constant force of 8 N acts through 4 m on a 4 kg block initially at rest on a frictionless surface. What is its final speed?",
    choices: mc("4 m/s", "8 m/s", "2 m/s", "16 m/s"),
    correct: "A",
    explanation:
      "Work done is 8 times 4, which is 32 J, and with no friction all of it becomes kinetic energy. Setting half m v squared equal to 32 with m of 4 gives v squared of 16, so v is 4 m/s. This is faster than finding the acceleration first, and the work-energy theorem is usually the shortcut whenever a question gives force and distance rather than force and time.",
  },
  {
    section: "physics",
    domain: "Rotational motion",
    skill: "Rolling without slipping",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "A solid sphere rolls without slipping. What fraction of its total kinetic energy is rotational?",
    choices: mc("2/7", "5/7", "2/5", "1/2"),
    correct: "A",
    explanation:
      "For a solid sphere the moment of inertia is two fifths m r squared, and rolling without slipping means omega equals v over r. Rotational energy is then one fifth m v squared and translational is one half m v squared, giving seven tenths m v squared in total. The rotational share is one fifth divided by seven tenths, which is two sevenths. Choosing 2/5 is quoting the moment of inertia coefficient rather than computing the ratio.",
  },
  {
    section: "physics",
    domain: "Oscillations",
    skill: "Simple harmonic motion",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A mass on a spring has period T. If the mass is made four times larger and the spring is unchanged, the new period is:",
    choices: mc("2T", "4T", "T/2", "T"),
    correct: "A",
    explanation:
      "The period is two pi times the square root of m over k, so it depends on the square root of the mass. Four times the mass multiplies the period by the square root of four, which is two. Answering 4T treats the relationship as linear, which is the error this item is built to catch.",
  },
  {
    section: "physics",
    domain: "Thermodynamics",
    skill: "First law",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "An ideal gas expands isothermally and reversibly. Which statement is correct?",
    choices: mc(
      "The heat absorbed equals the work done by the gas",
      "The heat absorbed equals the change in internal energy",
      "No heat is exchanged with the surroundings",
      "The work done by the gas is zero"
    ),
    correct: "A",
    explanation:
      "Internal energy of an ideal gas depends only on temperature, so an isothermal change means the internal energy change is zero. The first law then reduces to heat in equals work out. The option about no heat exchange describes an adiabatic process, which is a different constraint entirely.",
  },
  {
    section: "physics",
    domain: "Electrostatics",
    skill: "Coulomb's law",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "Two point charges attract each other with force F. If the separation between them is doubled and the charges are unchanged, the new force is:",
    choices: mc("F/4", "F/2", "2F", "4F"),
    correct: "A",
    explanation:
      "Coulomb's law is an inverse square law, so doubling the separation divides the force by four. Answering F/2 treats it as inverse linear, which is the trap; the same reasoning applies to gravitation, which is why this relationship is worth being automatic about.",
  },
  {
    section: "physics",
    domain: "Current electricity",
    skill: "Resistors in parallel",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "A 6 ohm resistor and a 3 ohm resistor are connected in parallel. What is the equivalent resistance?",
    choices: mc("2 ohm", "9 ohm", "4.5 ohm", "18 ohm"),
    correct: "A",
    explanation:
      "For two resistors in parallel the equivalent is the product over the sum: 18 over 9, which is 2 ohm. A useful check is that a parallel combination is always smaller than the smallest resistor present, so 4.5 and 9 can be rejected on sight without any arithmetic.",
  },
  {
    section: "physics",
    domain: "Ray optics",
    skill: "Thin lens imaging",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "An object is placed at a distance of twice the focal length from a converging lens. The image formed is:",
    choices: mc(
      "real, inverted and the same size as the object",
      "virtual, upright and magnified",
      "real, inverted and magnified",
      "virtual, inverted and diminished"
    ),
    correct: "A",
    explanation:
      "Putting u at 2f into the lens equation gives v at 2f on the far side, so the magnification is exactly one. This is the crossover case: closer than 2f the image is magnified, further away it is diminished. Note also that a real image from a single converging lens is always inverted, which makes the virtual-and-inverted option impossible on its own terms.",
  },
  {
    section: "physics",
    domain: "Modern physics",
    skill: "Photoelectric effect",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "In a photoelectric experiment, increasing the intensity of the incident light while keeping its frequency fixed will:",
    choices: mc(
      "increase the number of photoelectrons but not their maximum kinetic energy",
      "increase the maximum kinetic energy of the photoelectrons",
      "increase both the number and the maximum kinetic energy",
      "have no effect on the emitted photoelectrons"
    ),
    correct: "A",
    explanation:
      "Intensity is the number of photons per second, so it sets how many electrons are ejected. The energy each electron carries away comes from a single photon and depends on frequency alone, through h nu minus the work function. This split is the whole reason the photoelectric effect could not be explained by a wave picture, in which brighter light should have meant faster electrons.",
  },
  {
    section: "physics",
    domain: "Kinetic theory",
    skill: "Molecular speeds",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "The root mean square speed of oxygen molecules at temperature T is v. At the same temperature, the rms speed of hydrogen molecules, which have one sixteenth the molar mass, is:",
    choices: mc("4v", "16v", "v/4", "v"),
    correct: "A",
    explanation:
      "The rms speed goes as the square root of T over M. At the same temperature only the mass matters, and one sixteenth the mass means four times the speed. Answering 16v forgets the square root; this is also why light gases escape a planet's atmosphere preferentially.",
  },
  {
    section: "physics",
    domain: "Electromagnetic induction",
    skill: "Lenz's law",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A bar magnet is pushed north-pole-first towards a closed conducting loop. The induced current in the loop, viewed from the magnet's side, flows so as to:",
    choices: mc(
      "oppose the approach, presenting a north pole towards the magnet",
      "assist the approach, presenting a south pole towards the magnet",
      "flow only after the magnet stops moving",
      "be zero, because the loop has no source of emf"
    ),
    correct: "A",
    explanation:
      "Lenz's law says the induced effect opposes the change producing it, so the loop presents a like pole and repels the incoming magnet. The alternative would have the loop pull the magnet in, accelerating it, producing more current, and creating energy from nothing. The loop's emf is the changing flux itself, which is why the last option is wrong.",
  },

  /* --------------------------------------------------------- Chemistry */
  {
    section: "chemistry",
    domain: "Some basic concepts",
    skill: "Mole concept",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "How many moles of carbon dioxide are present in 88 g of the gas? (Molar mass 44 g/mol)",
    choices: mc("2 mol", "1 mol", "4 mol", "0.5 mol"),
    correct: "A",
    explanation:
      "Moles are mass divided by molar mass: 88 over 44, which is 2. Answering 0.5 inverts the division, which is worth guarding against by sanity check -- a sample heavier than one molar mass must contain more than one mole.",
  },
  {
    section: "chemistry",
    domain: "Periodic properties",
    skill: "Ionisation enthalpy",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Which correctly describes the trend in first ionisation enthalpy on moving left to right across a period?",
    choices: mc(
      "It generally increases, because nuclear charge rises while shielding stays nearly constant",
      "It generally decreases, because atomic radius decreases",
      "It stays constant, because the number of shells does not change",
      "It generally decreases, because electrons are added to the same shell"
    ),
    correct: "A",
    explanation:
      "Across a period the added electrons enter the same shell, so they shield each other poorly while the nuclear charge keeps climbing. The outer electrons are held more tightly and are harder to remove. Note that a smaller radius makes removal harder, not easier, which is why the second option has the right fact attached to the wrong conclusion.",
  },
  {
    section: "chemistry",
    domain: "Chemical bonding",
    skill: "VSEPR and hybridisation",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Ammonia has a bond angle of about 107 degrees rather than the 109.5 degrees of a regular tetrahedron. The best explanation is that:",
    choices: mc(
      "the lone pair repels the bonding pairs more strongly than they repel each other",
      "nitrogen is sp2 hybridised rather than sp3",
      "the N-H bonds are shorter than a tetrahedral geometry requires",
      "hydrogen atoms repel one another more strongly than the lone pair does"
    ),
    correct: "A",
    explanation:
      "Nitrogen is sp3 hybridised with four electron domains, but one is a lone pair. A lone pair is held closer to the nucleus and spreads out more, so it squeezes the three bonding pairs together and the angle closes slightly below the ideal. The same reasoning predicts the further reduction to about 104.5 degrees in water, which has two lone pairs.",
  },
  {
    section: "chemistry",
    domain: "Chemical kinetics",
    skill: "First-order reactions",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "For a first-order reaction, the half-life is:",
    choices: mc(
      "independent of the initial concentration",
      "directly proportional to the initial concentration",
      "inversely proportional to the initial concentration",
      "proportional to the square of the initial concentration"
    ),
    correct: "A",
    explanation:
      "For first order, the half-life is 0.693 over k, and no concentration term appears. This is why radioactive decay has a fixed half-life regardless of sample size. It is specific to first order: a second-order half-life does depend on the starting concentration, so the property is a useful way to identify the order from data.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Nucleophilic substitution",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Tertiary alkyl halides undergo substitution predominantly by the SN1 mechanism rather than SN2 mainly because:",
    choices: mc(
      "the tertiary carbocation intermediate is stabilised and the crowded carbon blocks backside attack",
      "tertiary halides have unusually weak carbon-halogen bonds",
      "the nucleophile is more reactive towards tertiary carbon",
      "SN2 requires a carbocation, which tertiary halides cannot form"
    ),
    correct: "A",
    explanation:
      "Two effects push the same way. Electronically, three alkyl groups donate electron density and stabilise the carbocation that SN1 must form. Sterically, those same groups block the backside approach SN2 needs. The last option inverts the mechanisms: it is SN1 that goes through a carbocation, while SN2 is a single concerted step with no intermediate at all.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Structural isomerism",
    difficulty: "easy",
    stimulus: null,
    questionText: "How many structural isomers does butane, C4H10, have?",
    choices: mc("2", "3", "4", "1"),
    correct: "A",
    explanation:
      "There are two: the straight chain n-butane, and the branched isobutane, which is 2-methylpropane. Drawing what looks like a third by bending the chain on paper is the usual error -- a bent chain is the same molecule viewed differently, since a structural isomer requires a genuinely different connectivity.",
  },
  {
    section: "chemistry",
    domain: "Thermodynamics",
    skill: "Gibbs free energy",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A reaction is endothermic and results in an increase in entropy. It will be spontaneous:",
    choices: mc(
      "at high temperatures only",
      "at low temperatures only",
      "at all temperatures",
      "at no temperature"
    ),
    correct: "A",
    explanation:
      "Spontaneity requires a negative change in Gibbs energy, which is delta H minus T delta S. Here delta H is positive, which works against it, but delta S is also positive, so the minus T delta S term becomes more negative as temperature rises. Above a threshold temperature the entropy term wins. This is precisely why ice melts spontaneously above zero degrees and not below it.",
  },
  {
    section: "chemistry",
    domain: "Coordination compounds",
    skill: "Oxidation state",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the oxidation state of cobalt in the complex ion hexaamminecobalt(III), written as Co(NH3)6 with an overall charge of 3+?",
    choices: mc("+3", "+2", "+6", "0"),
    correct: "A",
    explanation:
      "Ammonia is a neutral ligand, contributing nothing to the charge, so the metal must carry the entire 3+ by itself. Answering +6 comes from counting the six ligands rather than their charge; the count of ligands is the coordination number, which is a separate property from oxidation state.",
  },
  {
    section: "chemistry",
    domain: "Equilibrium",
    skill: "Le Chatelier's principle",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "For the equilibrium N2(g) + 3H2(g) in balance with 2NH3(g), which change shifts the position of equilibrium towards ammonia?",
    choices: mc(
      "Increasing the total pressure",
      "Decreasing the total pressure",
      "Adding a catalyst",
      "Increasing the volume of the vessel"
    ),
    correct: "A",
    explanation:
      "There are four moles of gas on the left and two on the right, so raising the pressure favours the side that occupies less volume. A catalyst is worth singling out: it speeds both directions equally and changes how fast equilibrium arrives, never where it sits. Increasing the volume is the same as lowering the pressure, so it shifts the other way.",
  },
  {
    section: "chemistry",
    domain: "Solutions",
    skill: "Colligative properties",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Equimolar aqueous solutions of glucose and sodium chloride are compared. The depression in freezing point of the sodium chloride solution is approximately:",
    choices: mc(
      "twice that of the glucose solution",
      "the same as that of the glucose solution",
      "half that of the glucose solution",
      "unrelated, because the two solutes differ chemically"
    ),
    correct: "A",
    explanation:
      "Colligative properties count dissolved particles rather than caring what they are. Glucose dissolves as single molecules, while sodium chloride dissociates into two ions, so an equimolar solution contains roughly twice as many particles and depresses the freezing point about twice as much. This particle count is the van't Hoff factor, and it is the whole reason salt is spread on icy roads rather than sugar.",
  },
  {
    section: "chemistry",
    domain: "Electrochemistry",
    skill: "Electrode potential",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "In a galvanic cell operating spontaneously, the electrode at which oxidation occurs is:",
    choices: mc(
      "the anode, which is the negative terminal",
      "the cathode, which is the negative terminal",
      "the anode, which is the positive terminal",
      "the cathode, which is the positive terminal"
    ),
    correct: "A",
    explanation:
      "Oxidation always happens at the anode, in every cell, by definition. What flips between galvanic and electrolytic cells is the sign: in a galvanic cell the anode releases electrons into the external circuit and is therefore negative, while in electrolysis the anode is driven positive by the supply. Tying the sign to the process rather than memorising it is what stops this being confusing.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Aromaticity",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "According to Huckel's rule, a planar cyclic conjugated species is aromatic when its delocalised system contains:",
    choices: mc(
      "4n + 2 pi electrons, where n is zero or a positive integer",
      "4n pi electrons, where n is a positive integer",
      "exactly six pi electrons in all cases",
      "any even number of pi electrons"
    ),
    correct: "A",
    explanation:
      "The count is 4n + 2, giving the aromatic series 2, 6, 10 and so on. Benzene is the familiar case at six, but the cyclopropenyl cation is aromatic with two, which is why the exactly-six option is too narrow. A 4n count such as cyclobutadiene's four is antiaromatic and markedly unstable, so the even-number option is wrong in a way that matters.",
  },

  /* ------------------------------------------------------ Mathematics */
  {
    section: "mathematics",
    domain: "Quadratic equations",
    skill: "Sum and product of roots",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "If the roots of x squared minus 5x + 6 equal zero are alpha and beta, what is the value of alpha squared plus beta squared?",
    choices: mc("13", "25", "12", "1"),
    correct: "A",
    explanation:
      "The sum of the roots is 5 and the product is 6. Using the identity that alpha squared plus beta squared equals the sum squared minus twice the product gives 25 minus 12, which is 13. Answering 25 stops at the sum squared and forgets to subtract; the identity is worth knowing because it avoids solving for the roots at all.",
  },
  {
    section: "mathematics",
    domain: "Sequences and series",
    skill: "Arithmetic progression",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the sum of the first 20 terms of the arithmetic progression 3, 7, 11, 15, ...?",
    choices: mc("820", "800", "410", "1640"),
    correct: "A",
    explanation:
      "The first term is 3 and the common difference is 4. The sum of n terms is n over 2 times twice the first term plus n minus one times d, giving 10 times 6 plus 76, which is 10 times 82, so 820. Answering 410 is the result of dropping the factor from n over 2.",
  },
  {
    section: "mathematics",
    domain: "Calculus",
    skill: "Differentiation",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "What is the derivative of x squared times sin x with respect to x?",
    choices: mc(
      "2x sin x + x squared cos x",
      "2x cos x",
      "x squared cos x",
      "2x sin x - x squared cos x"
    ),
    correct: "A",
    explanation:
      "This is a product, so the product rule applies: the derivative of the first times the second, plus the first times the derivative of the second. That gives 2x sin x plus x squared cos x. The two shorter options each differentiate one factor and forget the other, which is the error the product rule exists to prevent.",
  },
  {
    section: "mathematics",
    domain: "Calculus",
    skill: "Definite integration",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "What is the value of the definite integral of sin x from 0 to pi?",
    choices: mc("2", "0", "1", "pi"),
    correct: "A",
    explanation:
      "The antiderivative of sin x is minus cos x. Evaluating from 0 to pi gives minus cos pi minus minus cos 0, which is 1 plus 1, so 2. Answering 0 is what you get by integrating over a full period from 0 to 2 pi, where the positive and negative halves cancel -- over 0 to pi the curve is entirely above the axis, so the area cannot be zero.",
  },
  {
    section: "mathematics",
    domain: "Probability",
    skill: "Conditional probability",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Two fair dice are rolled. Given that the sum is 8, what is the probability that at least one die shows a 5?",
    choices: mc("2/5", "1/5", "1/3", "2/9"),
    correct: "A",
    explanation:
      "The outcomes summing to 8 are (2,6), (3,5), (4,4), (5,3) and (6,2), so five equally likely cases. Two of them contain a 5, giving two fifths. The common mistake is to use the unconditional probability of rolling a 5; being told the sum restricts the sample space to those five outcomes, and every conditional probability question turns on rebuilding that space correctly.",
  },
  {
    section: "mathematics",
    domain: "Complex numbers",
    skill: "Modulus and powers",
    difficulty: "medium",
    stimulus: null,
    questionText: "What is the value of i raised to the power 2026?",
    choices: mc("-1", "1", "i", "-i"),
    correct: "A",
    explanation:
      "Powers of i repeat with period four, so only the remainder on division by four matters. 2026 leaves a remainder of 2, and i squared is minus 1. Reducing the exponent modulo four turns any power of i into one of four cases and makes this instant.",
  },
  {
    section: "mathematics",
    domain: "Matrices and determinants",
    skill: "Determinant properties",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "If A is a 3 by 3 matrix with determinant 4, what is the determinant of 2A?",
    choices: mc("32", "8", "4", "64"),
    correct: "A",
    explanation:
      "Scaling a matrix multiplies every one of its n rows by the scalar, so the determinant is multiplied by the scalar to the power n. Here that is 2 cubed times 4, which is 32. Answering 8 applies the factor only once, which is the standard trap on this identity.",
  },
  {
    section: "mathematics",
    domain: "Coordinate geometry",
    skill: "Straight lines",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the slope of a line perpendicular to the line 2x + 3y = 6?",
    choices: mc("3/2", "-2/3", "-3/2", "2/3"),
    correct: "A",
    explanation:
      "Rearranging gives y equals minus two thirds x plus 2, so the slope is minus two thirds. Perpendicular slopes multiply to minus one, so the answer is the negative reciprocal, three halves. Answering minus two thirds gives the slope of the original line rather than the perpendicular one.",
  },
  {
    section: "mathematics",
    domain: "Calculus",
    skill: "Limits",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "What is the limit of sin(3x) divided by x as x approaches zero?",
    choices: mc("3", "1", "0", "1/3"),
    correct: "A",
    explanation:
      "The standard limit is that sin u over u tends to 1. Writing sin 3x over x as 3 times sin 3x over 3x makes the inner quotient tend to 1, leaving 3. Answering 1 applies the standard limit without accounting for the coefficient inside the sine.",
  },
  {
    section: "mathematics",
    domain: "Binomial theorem",
    skill: "General term",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "What is the coefficient of x cubed in the expansion of (1 + x) to the power 6?",
    choices: mc("20", "15", "6", "120"),
    correct: "A",
    explanation:
      "The coefficient is 6 choose 3, which is 6 factorial over 3 factorial times 3 factorial, so 720 over 36, giving 20. Answering 120 computes a permutation instead of a combination; order does not matter when selecting which factors contribute an x, so the division by 3 factorial is required.",
  },
  {
    section: "mathematics",
    domain: "Vectors",
    skill: "Scalar product",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "For non-zero vectors a and b, the scalar product a dot b equals zero implies that:",
    choices: mc(
      "a and b are perpendicular",
      "a and b are parallel",
      "at least one of a and b is the zero vector",
      "a and b are equal in magnitude"
    ),
    correct: "A",
    explanation:
      "The scalar product is the product of the magnitudes times cos theta. With both vectors non-zero, the product vanishes only when cos theta is zero, which means an angle of 90 degrees. Parallel vectors are the opposite case, where cos theta is one and the scalar product is at its maximum.",
  },
  {
    section: "mathematics",
    domain: "Trigonometry",
    skill: "Identities",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the exact value of sin 75 degrees?",
    choices: mc(
      "(square root of 6 plus square root of 2) divided by 4",
      "(square root of 6 minus square root of 2) divided by 4",
      "(square root of 3 plus 1) divided by 2",
      "1/2"
    ),
    correct: "A",
    explanation:
      "Write 75 as 45 plus 30 and expand: sin 45 cos 30 plus cos 45 sin 30. That gives root 6 over 4 plus root 2 over 4, so root 6 plus root 2 all over 4. The option with a minus sign is sin 15 degrees, which comes from the same expansion with 45 minus 30 -- a quick sanity check is that sin 75 must be close to 1, and this value is about 0.966.",
  },
];
