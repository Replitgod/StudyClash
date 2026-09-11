// The hard tier for NEET UG.
//
// The first NEET bank was 20 percent hard with no stimulus on any item. NEET
// leans harder on recall than JEE does, but its difficult items still put
// something in front of you -- a pedigree, a cross, a set of experimental
// results, a patient's numbers -- and ask you to reason from it. A bank of
// bare definitional questions trains the wrong half of the paper.
//
// Biology carries 90 of the 180 questions and half the marks, so it carries
// the largest share here too. Weighting it like one subject among three
// would train an allocation of attention that loses marks.
//
// Hard here means the same thing it means in the JEE tier: at least two
// steps chained together, and distractors that are each the answer to a
// specific wrong method rather than filler. It does not mean obscure. A
// question that turns on an exception nobody teaches lowers a score without
// teaching anything, and to the student it is indistinguishable from a
// mistake in the bank.

import type { BankItem } from "./jeeMain";

const mc = (...texts: string[]) => texts.map((text, i) => ({ id: "ABCD"[i], text }));

export const NEET_HARD: BankItem[] = [
  /* ----------------------------------------------------------- Physics */
  {
    section: "physics",
    domain: "Optics",
    skill: "Lens combinations",
    difficulty: "hard",
    stimulus:
      "A converging lens of focal length 20 cm is placed 30 cm from an object. A second converging lens of focal length 10 cm is placed 40 cm beyond the first.",
    questionText: "Where is the final image formed relative to the second lens?",
    choices: mc(
      "20 cm beyond it",
      "10 cm beyond it",
      "40 cm beyond it",
      "At the second lens itself"
    ),
    correct: "A",
    explanation:
      "For the first lens, 1/v equals 1/20 minus 1/30, giving an image 60 cm beyond it. That image lies 20 cm past the second lens, so it acts as a virtual object with u of plus 20. Applying the lens equation again gives 1/v equal to 1/10 plus 1/20, so v is 20 cm beyond the second lens. Treating the intermediate image as a real object with the sign unchanged is the standard error, and it is why the intermediate position must be located before the second lens is applied.",
  },
  {
    section: "physics",
    domain: "Thermodynamics",
    skill: "Efficiency",
    difficulty: "hard",
    stimulus:
      "A Carnot engine operates between a source at 500 K and a sink at 300 K, absorbing 1000 J per cycle from the source.",
    questionText: "How much work does it deliver per cycle?",
    choices: mc("400 J", "600 J", "1000 J", "200 J"),
    correct: "A",
    explanation:
      "Carnot efficiency is 1 minus the ratio of the absolute temperatures, so 1 minus 300 over 500, which is 0.4. The work is that efficiency times the heat absorbed, giving 400 J. Answering 600 J reports the heat rejected to the sink, which is the other 60 percent, and using Celsius rather than kelvin anywhere in this calculation makes the ratio meaningless.",
  },
  {
    section: "physics",
    domain: "Electrostatics",
    skill: "Field and potential",
    difficulty: "hard",
    stimulus:
      "Two point charges of plus 4 microcoulomb and minus 4 microcoulomb are fixed 20 cm apart.",
    questionText:
      "At the midpoint of the line joining them, which statement is correct?",
    choices: mc(
      "The potential is zero but the electric field is not",
      "The electric field is zero but the potential is not",
      "Both the field and the potential are zero",
      "Neither the field nor the potential is zero"
    ),
    correct: "A",
    explanation:
      "Potential is a scalar, so equal and opposite charges at equal distances contribute plus and minus values that cancel exactly. Field is a vector, and at the midpoint both charges push it the same way -- away from the positive and towards the negative -- so the two contributions add rather than cancel. This is the cleanest demonstration that zero potential does not imply zero field, and the reverse case holds between two equal positive charges.",
  },

  /* --------------------------------------------------------- Chemistry */
  {
    section: "chemistry",
    domain: "Solutions",
    skill: "Molality and colligative properties",
    difficulty: "hard",
    stimulus:
      "18 g of glucose, molar mass 180 g/mol, is dissolved in 500 g of water. The molal freezing point depression constant for water is 1.86 K kg/mol.",
    questionText: "By how much does the freezing point fall?",
    choices: mc("0.372 K", "0.186 K", "3.72 K", "0.744 K"),
    correct: "A",
    explanation:
      "18 g of glucose is 0.1 mol, dissolved in 0.5 kg of water, giving a molality of 0.2 mol/kg. The depression is Kf times molality, so 1.86 times 0.2, which is 0.372 K. Glucose does not dissociate, so the van't Hoff factor is 1 -- had this been sodium chloride the answer would have roughly doubled, which is the comparison worth holding onto.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Identifying products",
    difficulty: "hard",
    stimulus:
      "An organic compound of molecular formula C3H6O gives a positive iodoform test and does not reduce Tollens' reagent.",
    questionText: "What is the compound?",
    choices: mc("Propanone", "Propanal", "Propan-1-ol", "Propan-2-ol"),
    correct: "A",
    explanation:
      "Failing the Tollens test rules out an aldehyde, so propanal is out. A positive iodoform test requires a methyl group attached to a carbonyl, which propanone has. Propan-2-ol would also give iodoform, since it is oxidised to propanone under the test conditions, but its formula is C3H8O rather than C3H6O -- so the molecular formula settles it. Using all three pieces of evidence together is the point; any one alone leaves two candidates standing.",
  },
  {
    section: "chemistry",
    domain: "Atomic structure",
    skill: "Electronic configuration",
    difficulty: "hard",
    stimulus:
      "An element has the ground state electronic configuration [Ar] 3d5 4s1.",
    questionText: "Why is this configuration adopted rather than [Ar] 3d4 4s2?",
    choices: mc(
      "A half-filled d subshell gives extra stability from exchange energy",
      "The 3d orbitals are always lower in energy than the 4s",
      "The 4s orbital cannot hold two electrons in transition metals",
      "It minimises the total number of unpaired electrons"
    ),
    correct: "A",
    explanation:
      "Chromium promotes a 4s electron to give a half-filled 3d subshell, which is stabilised by exchange energy between electrons of parallel spin, plus the reduced repulsion of spreading electrons across five orbitals. The last option is the reverse of what happens: this configuration maximises unpaired electrons, at six, rather than minimising them. Copper does the same thing for a completely filled d subshell.",
  },

  /* ---------------------------------------------------------- Biology */
  {
    section: "biology",
    domain: "Genetics",
    skill: "Pedigree analysis",
    difficulty: "hard",
    stimulus:
      "In a family pedigree, a trait appears in every generation. Affected fathers pass it to all of their daughters but to none of their sons. Affected mothers pass it to about half of their children of either sex.",
    questionText: "What is the mode of inheritance?",
    choices: mc(
      "X-linked dominant",
      "X-linked recessive",
      "Autosomal dominant",
      "Y-linked"
    ),
    correct: "A",
    explanation:
      "An affected father passing the trait to every daughter and no son is the signature of X linkage, because he gives his X to all his daughters and his Y to all his sons. Appearing in every generation, and in heterozygous mothers passing it to half their children, marks it as dominant rather than recessive. A Y-linked trait would go father to son exclusively, which is the exact opposite of what is described.",
  },
  {
    section: "biology",
    domain: "Human physiology",
    skill: "Cardiac cycle",
    difficulty: "hard",
    stimulus:
      "During one phase of the cardiac cycle, both the atrioventricular valves and the semilunar valves are closed, ventricular volume is constant, and ventricular pressure is rising steeply.",
    questionText: "Which phase is being described?",
    choices: mc(
      "Isovolumetric contraction",
      "Ventricular ejection",
      "Isovolumetric relaxation",
      "Atrial systole"
    ),
    correct: "A",
    explanation:
      "All four valves closed with an unchanging volume means no blood is entering or leaving, so the pressure change identifies the phase: rising pressure is contraction, falling pressure would be relaxation. Ejection requires the semilunar valves to be open, and atrial systole requires the atrioventricular valves to be open, so both are excluded by the valve state before the pressure is even considered.",
  },
  {
    section: "biology",
    domain: "Plant physiology",
    skill: "Photosynthetic pathways",
    difficulty: "hard",
    stimulus:
      "Two plant species are grown side by side in hot, dry, high-light conditions. Species X shows no measurable photorespiration and has a CO2 compensation point near zero. Species Y shows substantial photorespiration.",
    questionText: "What best explains the difference in species X?",
    choices: mc(
      "It concentrates CO2 at the site of RuBisCO by fixing carbon first in mesophyll cells",
      "Its RuBisCO enzyme cannot bind oxygen at all",
      "It lacks the Calvin cycle entirely",
      "It carries out photosynthesis only at night"
    ),
    correct: "A",
    explanation:
      "A C4 plant fixes carbon initially as a four-carbon acid in mesophyll cells and releases CO2 in the bundle sheath, where RuBisCO sits. The resulting high local CO2 concentration outcompetes oxygen for the active site, so photorespiration is effectively suppressed. RuBisCO itself is unchanged and still binds oxygen given the chance -- the plant solves the problem by controlling the environment around the enzyme rather than by altering it, which is why the second option is wrong in an instructive way.",
  },
  {
    section: "biology",
    domain: "Molecular biology",
    skill: "Interpreting experiments",
    difficulty: "hard",
    stimulus:
      "In the Hershey and Chase experiment, bacteriophages were grown in media containing either radioactive sulfur or radioactive phosphorus, then used to infect bacteria. After blending and centrifuging, most of the phosphorus label was found in the bacterial pellet while most of the sulfur label stayed in the supernatant.",
    questionText: "What does this result establish?",
    choices: mc(
      "DNA, not protein, is the material that enters the cell and directs infection",
      "Protein and DNA enter the cell in equal amounts",
      "Sulfur is a component of DNA",
      "Bacteriophages inject their entire structure into the host"
    ),
    correct: "A",
    explanation:
      "Sulfur labels protein, since it is present in methionine and cysteine but not in nucleotides, while phosphorus labels DNA through its phosphate backbone. Phosphorus entering the cell and sulfur remaining outside shows that DNA is what is injected. The choice of two labels is the whole design: one element unique to each macromolecule is what makes the result unambiguous.",
  },
  {
    section: "biology",
    domain: "Ecology",
    skill: "Population growth",
    difficulty: "hard",
    stimulus:
      "A population growing in an environment with limited resources follows a curve that rises slowly at first, then steeply, then levels off as it approaches the carrying capacity K.",
    questionText: "At what population size is the growth RATE greatest?",
    choices: mc("At K/2", "At K", "Just above zero", "Just below K"),
    correct: "A",
    explanation:
      "Logistic growth has rate proportional to N times the quantity 1 minus N over K, a product that is maximised at half the carrying capacity. Near zero there are too few individuals reproducing; near K the limiting term approaches zero. This is why sustainable harvesting targets a population held near half its carrying capacity, where it replaces itself fastest.",
  },
  {
    section: "biology",
    domain: "Cell biology",
    skill: "Reasoning from structure",
    difficulty: "hard",
    stimulus:
      "A drug is found to bind tubulin and prevent microtubule polymerisation in dividing cells.",
    questionText: "At which stage would treated cells be expected to arrest?",
    choices: mc("Metaphase", "S phase", "G1 phase", "Telophase"),
    correct: "A",
    explanation:
      "Microtubules form the spindle that attaches to kinetochores and aligns chromosomes at the metaphase plate. Without polymerisation the spindle assembly checkpoint is never satisfied, so cells halt at metaphase. S phase and G1 both precede spindle formation and do not depend on it, and telophase lies beyond the block, which the cell can never reach.",
  },
];
