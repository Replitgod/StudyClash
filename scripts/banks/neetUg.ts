// An original NEET UG question bank.
//
// Every item was written for this file. Nothing reproduces, paraphrases or is
// derived from an NTA paper. What is taken from the NTA is the published 2026
// pattern -- 180 compulsory questions, Physics 45, Chemistry 45, Biology 90,
// at +4 and -1 -- and the NCERT syllabus the paper is drawn from.
//
// Biology carries half the paper and is weighted accordingly here. That is
// not padding: Biology is 360 of the 720 marks, and a NEET bank that treats
// it as one subject among three trains the wrong allocation of attention.
//
// Explanations name the answer by its CONTENT rather than by its letter
// ("the option giving two ions"), because the keys are redistributed at build
// time. An explanation that says "option B" is one rebalance away from
// arguing for a letter that is no longer the key.

import type { BankItem } from "./jeeMain";

const mc = (...texts: string[]) => texts.map((text, i) => ({ id: "ABCD"[i], text }));

export const NEET_UG: BankItem[] = [
  /* ----------------------------------------------------------- Physics */
  {
    section: "physics",
    domain: "Laws of motion",
    skill: "Friction",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "A block of mass 2 kg rests on a horizontal surface with coefficient of static friction 0.4. Taking g as 10 m/s squared, what is the maximum friction force before it begins to slide?",
    choices: mc("8 N", "20 N", "0.8 N", "5 N"),
    correct: "A",
    explanation:
      "Limiting friction is the coefficient times the normal force. The normal force here is the weight, 2 times 10, which is 20 N, so the maximum friction is 0.4 times 20, giving 8 N. Answering 20 N quotes the normal force itself and forgets to apply the coefficient.",
  },
  {
    section: "physics",
    domain: "Work, energy and power",
    skill: "Conservation of energy",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A body is dropped from rest at a height of 20 m. Ignoring air resistance and taking g as 10 m/s squared, what is its speed just before it hits the ground?",
    choices: mc("20 m/s", "10 m/s", "40 m/s", "200 m/s"),
    correct: "A",
    explanation:
      "All the potential energy becomes kinetic, so mgh equals half m v squared and the mass cancels. That leaves v squared equal to 2gh, which is 2 times 10 times 20, or 400, so the speed is 20 m/s. The mass cancelling is the point worth carrying away: a heavy and a light body arrive together in the absence of air resistance.",
  },
  {
    section: "physics",
    domain: "Current electricity",
    skill: "Ohm's law and power",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A 60 W bulb is designed for 120 V. What is its resistance when operating normally?",
    choices: mc("240 ohm", "2 ohm", "120 ohm", "7200 ohm"),
    correct: "A",
    explanation:
      "Power equals V squared over R, so R is V squared over P: 14400 divided by 60, which is 240 ohm. Answering 2 ohm comes from dividing voltage by power, which is not a form of Ohm's law and does not have units of resistance -- a dimension check catches it immediately.",
  },
  {
    section: "physics",
    domain: "Optics",
    skill: "Refraction",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Light passes from air into glass. Which quantity remains unchanged?",
    choices: mc("Frequency", "Speed", "Wavelength", "Direction of travel"),
    correct: "A",
    explanation:
      "Frequency is set by the source and cannot change at a boundary; if it did, wave crests would have to pile up or vanish at the interface. Speed falls in the denser medium, and since speed equals frequency times wavelength, the wavelength falls with it. The direction changes too, unless the light arrives along the normal.",
  },
  {
    section: "physics",
    domain: "Modern physics",
    skill: "Nuclear binding energy",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Energy is released in both nuclear fission of heavy nuclei and fusion of light nuclei because in each case the products have:",
    choices: mc(
      "a higher binding energy per nucleon than the reactants",
      "a lower binding energy per nucleon than the reactants",
      "more nucleons in total than the reactants",
      "a greater total mass than the reactants"
    ),
    correct: "A",
    explanation:
      "Binding energy per nucleon peaks near iron. Moving towards that peak from either direction -- splitting something heavier or combining something lighter -- gives products that are more tightly bound, and the difference is released. The mass option is the wrong way round: the products are lighter, and that lost mass is the energy, by E equals m c squared.",
  },
  {
    section: "physics",
    domain: "Thermodynamics",
    skill: "Heat transfer",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "How much heat is required to raise the temperature of 200 g of water by 10 degrees Celsius? (Specific heat capacity of water is 4.2 J per g per degree)",
    choices: mc("8400 J", "840 J", "84000 J", "420 J"),
    correct: "A",
    explanation:
      "Heat equals mass times specific heat times temperature change: 200 times 4.2 times 10, which is 8400 J. Water's unusually high specific heat is why it is used as a coolant and why coastal climates are milder than inland ones.",
  },

  /* --------------------------------------------------------- Chemistry */
  {
    section: "chemistry",
    domain: "Atomic structure",
    skill: "Quantum numbers",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "What is the maximum number of electrons that can occupy a 3d subshell?",
    choices: mc("10", "6", "14", "2"),
    correct: "A",
    explanation:
      "A d subshell has five orbitals and each holds two electrons with opposed spins, giving ten. The other numbers are the capacities of p at six, f at fourteen and a single orbital at two, so knowing the orbital counts of 1, 3, 5 and 7 for s, p, d and f covers every case.",
  },
  {
    section: "chemistry",
    domain: "Chemical bonding",
    skill: "Intermolecular forces",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Water has a much higher boiling point than hydrogen sulfide, despite sulfur being heavier than oxygen. The main reason is:",
    choices: mc(
      "hydrogen bonding between water molecules",
      "the greater molar mass of water",
      "the ionic character of the O-H bond",
      "stronger dispersion forces in water"
    ),
    correct: "A",
    explanation:
      "Oxygen is small and strongly electronegative, so water forms hydrogen bonds, which are far stronger than the dipole and dispersion forces holding hydrogen sulfide together. Sulfur is too large and not electronegative enough to do the same. Note that water is the lighter molecule, so mass would predict the opposite of what is observed -- that anomaly is exactly what hydrogen bonding explains.",
  },
  {
    section: "chemistry",
    domain: "Redox reactions",
    skill: "Oxidation number",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the oxidation number of manganese in the permanganate ion, MnO4 with a charge of 1 minus?",
    choices: mc("+7", "+4", "+2", "-1"),
    correct: "A",
    explanation:
      "Each oxygen is taken as minus 2, so four of them contribute minus 8. For the ion to carry an overall charge of minus 1, manganese must be plus 7. This is manganese at its maximum oxidation state, which is why permanganate is such a strong oxidising agent -- it has nowhere to go but down.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Functional groups",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Which reagent distinguishes an aldehyde from a ketone?",
    choices: mc(
      "Tollens' reagent, which gives a silver mirror with the aldehyde only",
      "Bromine water, which decolourises with the ketone only",
      "Sodium hydroxide, which dissolves the aldehyde only",
      "Litmus, which the aldehyde turns red"
    ),
    correct: "A",
    explanation:
      "An aldehyde has a hydrogen on its carbonyl carbon and is readily oxidised to a carboxylic acid, reducing silver ions to metallic silver and depositing the mirror. A ketone has two alkyl groups there instead and resists oxidation. Bromine water tests for unsaturation and litmus for acidity, neither of which separates these two.",
  },
  {
    section: "chemistry",
    domain: "States of matter",
    skill: "Gas laws",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A fixed mass of ideal gas at constant pressure is heated from 300 K to 600 K. Its volume:",
    choices: mc("doubles", "halves", "stays the same", "quadruples"),
    correct: "A",
    explanation:
      "At constant pressure, volume is proportional to absolute temperature, and 600 K is twice 300 K, so the volume doubles. The step that matters is using kelvin: doubling 27 degrees Celsius to 54 would not double the volume, because the proportionality only holds from absolute zero.",
  },
  {
    section: "chemistry",
    domain: "Biomolecules",
    skill: "Proteins",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "The secondary structure of a protein, such as an alpha helix, is stabilised primarily by:",
    choices: mc(
      "hydrogen bonds between backbone amide and carbonyl groups",
      "peptide bonds between adjacent amino acids",
      "disulfide bridges between cysteine side chains",
      "ionic bonds between charged side chains"
    ),
    correct: "A",
    explanation:
      "Secondary structure is a pattern in the backbone, held by hydrogen bonds between the N-H of one residue and the C=O of another further along. Peptide bonds define the primary sequence rather than folding it, while disulfide bridges and ionic interactions between side chains belong to tertiary structure.",
  },

  /* ---------------------------------------------------------- Biology */
  {
    section: "biology",
    domain: "Cell structure and function",
    skill: "Organelles",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "Which organelle is the site of aerobic respiration in eukaryotic cells?",
    choices: mc("Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"),
    correct: "A",
    explanation:
      "The mitochondrion carries out the Krebs cycle and oxidative phosphorylation, producing most of the cell's ATP. Ribosomes build proteins, the Golgi modifies and dispatches them, and lysosomes digest material -- none of which is respiration.",
  },
  {
    section: "biology",
    domain: "Genetics",
    skill: "Monohybrid cross",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Two heterozygous tall pea plants (Tt) are crossed, where tall is dominant to dwarf. What fraction of the offspring is expected to be dwarf?",
    choices: mc("1/4", "1/2", "3/4", "None"),
    correct: "A",
    explanation:
      "The cross gives TT, Tt, TT and tt in equal proportion. Only tt is dwarf, so one quarter. The three quarters figure is the tall phenotype, which is the answer to a different question -- and the phenotypic ratio of 3 to 1 hides a genotypic ratio of 1 to 2 to 1.",
  },
  {
    section: "biology",
    domain: "Human physiology",
    skill: "Circulatory system",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Which blood vessel carries oxygenated blood from the lungs to the heart?",
    choices: mc("Pulmonary vein", "Pulmonary artery", "Aorta", "Vena cava"),
    correct: "A",
    explanation:
      "The pulmonary vein is the exception to the usual rule that veins carry deoxygenated blood: it returns freshly oxygenated blood from the lungs to the left atrium. Its partner the pulmonary artery is the matching exception, carrying deoxygenated blood away from the heart. The definitions of artery and vein rest on direction of flow, not on oxygen content.",
  },
  {
    section: "biology",
    domain: "Plant physiology",
    skill: "Photosynthesis",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "In the light-dependent reactions of photosynthesis, the oxygen released originates from:",
    choices: mc("water", "carbon dioxide", "glucose", "ATP"),
    correct: "A",
    explanation:
      "Photolysis splits water to supply electrons to photosystem II, and the oxygen is the leftover. Carbon dioxide is the intuitive guess and is wrong: its carbon and oxygen end up in carbohydrate during the Calvin cycle. Isotope labelling experiments settled this by tracing heavy oxygen supplied in water into the gas released.",
  },
  {
    section: "biology",
    domain: "Molecular biology",
    skill: "Central dogma",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "During transcription in eukaryotes, the enzyme responsible for synthesising messenger RNA is:",
    choices: mc("RNA polymerase II", "DNA polymerase", "Ligase", "Helicase alone"),
    correct: "A",
    explanation:
      "RNA polymerase II reads the template strand and builds the mRNA transcript. DNA polymerase replicates DNA rather than transcribing it, ligase seals breaks in a backbone, and helicase only unwinds the double helix without synthesising anything.",
  },
  {
    section: "biology",
    domain: "Ecology",
    skill: "Energy flow",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Roughly what proportion of energy is transferred from one trophic level to the next in a typical food chain?",
    choices: mc("About 10 percent", "About 50 percent", "About 90 percent", "Nearly all of it"),
    correct: "A",
    explanation:
      "Most energy at each level is spent on respiration, movement and heat, leaving only around a tenth available to the level above. This is why food chains rarely exceed four or five links and why a given area supports far more plants than predators.",
  },
  {
    section: "biology",
    domain: "Human physiology",
    skill: "Excretory system",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Most reabsorption of glucose from the glomerular filtrate occurs in the:",
    choices: mc(
      "proximal convoluted tubule",
      "loop of Henle",
      "distal convoluted tubule",
      "collecting duct"
    ),
    correct: "A",
    explanation:
      "The proximal convoluted tubule reclaims essentially all filtered glucose, along with amino acids and most water and ions, using active transport. Its cells carry a dense brush border of microvilli for exactly this. The loop of Henle concentrates the filtrate, while the distal tubule and collecting duct fine-tune water and salt under hormonal control.",
  },
  {
    section: "biology",
    domain: "Cell division",
    skill: "Meiosis",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Crossing over during meiosis occurs in which stage, and between which structures?",
    choices: mc(
      "Prophase I, between non-sister chromatids of homologous chromosomes",
      "Prophase II, between sister chromatids of the same chromosome",
      "Metaphase I, between all four chromatids simultaneously",
      "Anaphase I, as homologues separate"
    ),
    correct: "A",
    explanation:
      "Homologues pair during prophase I and exchange segments at chiasmata, and the exchange is between non-sister chromatids -- one from each homologue. Sister chromatids are identical copies, so exchanging material between them would produce no new combinations, which is why the prophase II option describes something with no genetic consequence.",
  },
  {
    section: "biology",
    domain: "Evolution",
    skill: "Natural selection",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A population of bacteria survives a course of antibiotics. The best explanation is that:",
    choices: mc(
      "resistant variants were already present and were the ones that reproduced",
      "the bacteria developed resistance in response to the antibiotic",
      "the antibiotic caused mutations that produced resistance",
      "individual bacteria adapted during their own lifetimes"
    ),
    correct: "A",
    explanation:
      "Selection acts on variation that already exists: mutation is undirected, and the antibiotic removes the susceptible rather than instructing the survivors. The other options all describe an organism acquiring a trait because it needs it, which is the Lamarckian picture, and it is the single most common misconception about how resistance arises.",
  },

  /* --------------------------------------------- Physics (continued) */
  {
    section: "physics",
    domain: "Kinematics",
    skill: "Graphs of motion",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "For an object accelerating uniformly from rest, the graph of displacement against time is:",
    choices: mc("a parabola", "a straight line through the origin", "a horizontal line", "a hyperbola"),
    correct: "A",
    explanation:
      "With constant acceleration from rest, displacement is half a t squared, so it grows as the square of time and traces a parabola. A straight line would mean constant velocity, which is the case of zero acceleration -- that describes the velocity-time graph here, not the displacement one.",
  },
  {
    section: "physics",
    domain: "Gravitation",
    skill: "Orbital motion",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "A satellite is moved into an orbit of four times its original radius around the Earth. Its orbital speed becomes:",
    choices: mc("half the original", "twice the original", "one quarter of the original", "unchanged"),
    correct: "A",
    explanation:
      "Orbital speed is the square root of GM over r, so it varies inversely with the square root of the radius, and four times the radius halves the speed. Higher orbits are slower, which is why a geostationary satellite takes a full day to circle while the space station takes about ninety minutes.",
  },
  {
    section: "physics",
    domain: "Magnetism",
    skill: "Force on a moving charge",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A charged particle travels parallel to a uniform magnetic field. The magnetic force acting on it is:",
    choices: mc("zero", "maximum", "directed along the field", "directed opposite to its motion"),
    correct: "A",
    explanation:
      "The magnetic force is qvB sin theta, and the angle between velocity and field is zero here, so the force vanishes. It is greatest when the particle moves perpendicular to the field. The force is also always perpendicular to the velocity, which is why a magnetic field can bend a path but never change a particle's speed or do work on it.",
  },
  {
    section: "physics",
    domain: "Waves",
    skill: "Doppler effect",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "A stationary observer hears the siren of an approaching ambulance. Compared with the emitted sound, the observer hears:",
    choices: mc(
      "a higher frequency, with the speed of sound unchanged",
      "a higher frequency, with the speed of sound increased",
      "a lower frequency, with the speed of sound unchanged",
      "the same frequency, with only the loudness increased"
    ),
    correct: "A",
    explanation:
      "Approaching motion compresses successive wavefronts, so they arrive more often and the pitch rises. The speed of sound is fixed by the medium -- air temperature and composition -- and does not depend on how fast the source is moving, which is the part most often got wrong.",
  },

  /* ------------------------------------------- Chemistry (continued) */
  {
    section: "chemistry",
    domain: "Ionic equilibrium",
    skill: "pH calculation",
    difficulty: "easy",
    stimulus: null,
    questionText:
      "What is the pH of a 0.001 M solution of hydrochloric acid at 25 degrees Celsius?",
    choices: mc("3", "11", "1", "0.001"),
    correct: "A",
    explanation:
      "Hydrochloric acid is strong and dissociates completely, so the hydrogen ion concentration is 10 to the minus 3 and the pH is 3. Answering 11 computes the pOH instead; the two must sum to 14, and an acid has to land below 7, which catches the error immediately.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Optical isomerism",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "What is required for a carbon atom to be a stereocentre giving rise to optical isomerism?",
    choices: mc(
      "Four different groups attached to it",
      "A double bond to an adjacent carbon",
      "At least one hydrogen atom attached to it",
      "Attachment to an aromatic ring"
    ),
    correct: "A",
    explanation:
      "A carbon bonded to four different groups has a mirror image that cannot be superimposed on it, giving a pair of enantiomers. If any two of the groups are identical the molecule has an internal mirror plane and is achiral. A double bond produces cis-trans isomerism, which is geometric rather than optical.",
  },
  {
    section: "chemistry",
    domain: "Periodic properties",
    skill: "Atomic radius",
    difficulty: "medium",
    stimulus: null,
    questionText: "Which of these atoms has the largest atomic radius?",
    choices: mc("Potassium", "Sodium", "Lithium", "Hydrogen"),
    correct: "A",
    explanation:
      "All four sit in group 1, and atomic radius increases down a group as further electron shells are added. Potassium is the lowest of these and therefore the largest. Across a period the trend runs the other way, because electrons enter the same shell while the nuclear charge keeps rising.",
  },
  {
    section: "chemistry",
    domain: "Surface chemistry",
    skill: "Catalysis",
    difficulty: "medium",
    stimulus: null,
    questionText: "A catalyst increases the rate of a reaction by:",
    choices: mc(
      "providing an alternative pathway of lower activation energy",
      "increasing the average kinetic energy of the reactant molecules",
      "shifting the equilibrium position towards the products",
      "raising the temperature of the reaction mixture"
    ),
    correct: "A",
    explanation:
      "A catalyst opens a different route over a lower barrier, so a larger fraction of collisions carries enough energy to react. It does not heat the mixture or alter the energy distribution of the molecules, and it accelerates the forward and reverse reactions equally -- which is precisely why it cannot move the equilibrium position.",
  },

  /* --------------------------------------------- Biology (continued) */
  {
    section: "biology",
    domain: "Human physiology",
    skill: "Respiratory transport",
    difficulty: "medium",
    stimulus: null,
    questionText: "Most carbon dioxide is carried in the blood as:",
    choices: mc(
      "bicarbonate ions in the plasma",
      "carbaminohaemoglobin bound within red cells",
      "carbon dioxide gas dissolved in the plasma",
      "carbon monoxide complexes"
    ),
    correct: "A",
    explanation:
      "About seventy percent travels as bicarbonate, formed when carbonic anhydrase inside red cells converts carbon dioxide and water into carbonic acid, which then dissociates. Roughly twenty percent binds to haemoglobin and only about ten percent remains dissolved. The same system is what ties breathing to blood pH.",
  },
  {
    section: "biology",
    domain: "Genetics",
    skill: "Sex-linked inheritance",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "Haemophilia is X-linked recessive. A carrier mother and an unaffected father have children. What proportion of their SONS is expected to be affected?",
    choices: mc("One half", "One quarter", "All of them", "None of them"),
    correct: "A",
    explanation:
      "Sons take their single X chromosome from their mother, and half of her X chromosomes carry the allele, so half the sons are affected. Daughters also receive a normal X from their father, so none are affected although half are carriers. One quarter is the share of ALL children affected, which answers a different question than the one asked.",
  },
  {
    section: "biology",
    domain: "Plant physiology",
    skill: "Transport in plants",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Water rises through the xylem of a tall tree mainly because of:",
    choices: mc(
      "transpiration pull, created by evaporation from the leaves",
      "root pressure alone pushing water upward",
      "active transport carried out by xylem vessel cells",
      "capillary action within the vessels alone"
    ),
    correct: "A",
    explanation:
      "Evaporation at the leaf surface puts the water column under tension, and cohesion between water molecules transmits that pull the whole way down to the roots. Root pressure is real but far too weak to raise water tens of metres, and mature xylem vessels are dead cells with no capacity for active transport at all.",
  },
  {
    section: "biology",
    domain: "Microbiology",
    skill: "Viral biology",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Viruses are not classified as living organisms mainly because they:",
    choices: mc(
      "cannot carry out metabolism or reproduce outside a host cell",
      "contain no genetic material of any kind",
      "are too small to be resolved by any microscope",
      "never cause disease in other organisms"
    ),
    correct: "A",
    explanation:
      "A virus has no metabolic machinery and must take over a host cell's ribosomes and enzymes to replicate. It does carry genetic material, either DNA or RNA, so the second option is plainly false. Electron microscopy resolves viruses perfectly well, and many are highly pathogenic.",
  },
  {
    section: "biology",
    domain: "Human physiology",
    skill: "Neural conduction",
    difficulty: "hard",
    stimulus: null,
    questionText:
      "During repolarisation of a neuronal action potential, the dominant ion movement is:",
    choices: mc(
      "potassium moving out of the cell",
      "sodium moving into the cell",
      "calcium moving into the cell",
      "chloride moving out of the cell"
    ),
    correct: "A",
    explanation:
      "Depolarisation is driven by sodium rushing inward; repolarisation follows once sodium channels inactivate and the slower voltage-gated potassium channels open, letting potassium leave and carrying the membrane potential back down. Those potassium channels close sluggishly, which is what overshoots into the brief hyperpolarisation after each spike.",
  },
  {
    section: "biology",
    domain: "Biotechnology",
    skill: "Recombinant DNA",
    difficulty: "medium",
    stimulus: null,
    questionText:
      "Restriction endonucleases are central to recombinant DNA work because they:",
    choices: mc(
      "cut DNA at specific recognition sequences",
      "join DNA fragments together permanently",
      "synthesise DNA from an RNA template",
      "unwind the double helix without cutting it"
    ),
    correct: "A",
    explanation:
      "A restriction enzyme recognises a short specific sequence and cuts there reliably, often leaving sticky ends that will pair with any fragment cut by the same enzyme. Joining those fragments is the job of ligase, and building DNA from RNA is reverse transcriptase -- three enzymes that are easy to confuse and that do quite different things.",
  },
];
