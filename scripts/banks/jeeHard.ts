// The hard tier for JEE Main.
//
// The first JEE bank was 19 percent hard and carried no stimulus at all --
// every item a bare question with no setup. Real JEE items routinely hand
// you a circuit, a reaction sequence, a graph or a table and make you work
// from it, and a bank of context-free one-liners trains recall of formulas
// rather than the thing the paper actually measures.
//
// What "hard" means here, concretely, and what it does not:
//
// It means multi-step. Every item below needs at least two ideas chained
// together -- resolve, then apply conservation; identify the mechanism, then
// predict the product; set up the integral, then evaluate at the right
// limits. A single-step question is not made hard by using bigger numbers.
//
// It means distractors that are the ANSWER TO THE WRONG METHOD. Each wrong
// option below is where a specific, common error actually lands: the sign
// flipped, the component forgotten, the factor of two dropped. A student who
// picks one should be able to see exactly which step betrayed them.
//
// It does NOT mean obscure. Nothing here is off-syllabus, and nothing turns
// on remembering a constant to four figures or spotting a trick. Difficulty
// from obscurity is fake difficulty: it lowers scores without teaching
// anything, and it is indistinguishable to the student from a bad question.
//
// The `hard` label stays honest for a reason beyond tidiness. lib/irt.ts
// maps difficulty onto a beta value, and the score estimate is built on that
// mapping -- so labelling a medium item hard does not make the bank tougher,
// it makes the predicted score wrong in the pessimistic direction. The way
// to raise the ceiling is to write harder questions, not to relabel easier
// ones.

import type { BankItem } from "./jeeMain";

const mc = (...texts: string[]) => texts.map((text, i) => ({ id: "ABCD"[i], text }));

export const JEE_HARD: BankItem[] = [
  /* ----------------------------------------------------------- Physics */
  {
    section: "physics",
    domain: "Laws of motion",
    skill: "Connected bodies",
    difficulty: "hard",
    stimulus:
      "Two blocks are connected by a light inextensible string over a frictionless pulley at the edge of a table. Block A, of mass 3 kg, lies on the horizontal table top. Block B, of mass 2 kg, hangs vertically. The coefficient of kinetic friction between block A and the table is 0.2. Take g as 10 m/s squared.",
    questionText: "What is the acceleration of the system once it is released?",
    choices: mc("2.8 m/s squared", "4.0 m/s squared", "2.0 m/s squared", "6.0 m/s squared"),
    correct: "A",
    explanation:
      "The driving force is the weight of B, 20 N. Opposing it is friction on A, which is 0.2 times its normal force of 30 N, so 6 N. The net force is 14 N and the moving mass is the whole system, 5 kg, giving 2.8 m/s squared. Answering 4.0 ignores friction entirely; answering 6.0 accelerates B alone and forgets that A must be dragged along with it.",
  },
  {
    section: "physics",
    domain: "Work, energy and power",
    skill: "Energy with friction",
    difficulty: "hard",
    stimulus:
      "A 2 kg block is released from rest at the top of a frictionless incline of height 5 m. At the bottom it slides onto a rough horizontal surface with coefficient of kinetic friction 0.25, and comes to rest after travelling a distance d. Take g as 10 m/s squared.",
    questionText: "What is d?",
    choices: mc("20 m", "10 m", "5 m", "40 m"),
    correct: "A",
    explanation:
      "All the potential energy, mgh, becomes kinetic at the bottom, and friction then removes it over the distance d as the force times that distance. Setting mgh equal to mu m g d cancels both the mass and g, leaving d as h over mu: 5 divided by 0.25, which is 20 m. The mass cancelling is the useful insight -- a heavier block arrives faster but is also harder to stop, and slides exactly as far.",
  },
  {
    section: "physics",
    domain: "Current electricity",
    skill: "Circuit analysis",
    difficulty: "hard",
    stimulus:
      "A 12 V battery of negligible internal resistance is connected to a 4 ohm resistor in series with a parallel combination of a 6 ohm and a 3 ohm resistor.",
    questionText: "What current flows through the 6 ohm resistor?",
    choices: mc("0.667 A", "2.0 A", "1.33 A", "3.0 A"),
    correct: "A",
    explanation:
      "The parallel pair is 18 over 9, which is 2 ohm, so the total resistance is 6 ohm and the battery drives 2 A. That full 2 A crosses the 4 ohm resistor, dropping 8 V and leaving 4 V across the parallel section. The 6 ohm branch therefore carries 4 over 6, which is 0.667 A. Answering 2.0 A gives the total current rather than the share taken by one branch -- in parallel the branches split current in inverse proportion to their resistances.",
  },
  {
    section: "physics",
    domain: "Rotational motion",
    skill: "Angular momentum",
    difficulty: "hard",
    stimulus:
      "A disc of moment of inertia I spins freely at angular velocity omega. A second identical stationary disc is dropped coaxially onto it, and the two rotate together.",
    questionText: "What fraction of the original kinetic energy is lost?",
    choices: mc("One half", "One quarter", "One third", "None -- energy is conserved"),
    correct: "A",
    explanation:
      "No external torque acts, so angular momentum is conserved: I omega equals 2I omega prime, giving a final angular velocity of omega over 2. The kinetic energy, half I omega squared, starts at half I omega squared and ends at half of 2I times omega over 2 squared, which is a quarter I omega squared -- half the original. The loss goes to friction between the surfaces as they come to a common speed, which is why this is an inelastic collision in rotational form.",
  },
  {
    section: "physics",
    domain: "Modern physics",
    skill: "Photoelectric threshold",
    difficulty: "hard",
    stimulus:
      "A metal has a work function of 2.0 eV. Light of wavelength 400 nm falls on it. Take hc as 1240 eV nm.",
    questionText: "What is the maximum kinetic energy of the emitted photoelectrons?",
    choices: mc("1.1 eV", "3.1 eV", "5.1 eV", "0.9 eV"),
    correct: "A",
    explanation:
      "The photon energy is hc over lambda, 1240 divided by 400, which is 3.1 eV. Einstein's equation gives the maximum kinetic energy as the photon energy minus the work function, so 3.1 minus 2.0, which is 1.1 eV. Answering 3.1 stops at the photon energy and forgets that the work function must be paid first; answering 5.1 adds the two instead of subtracting.",
  },

  /* --------------------------------------------------------- Chemistry */
  {
    section: "chemistry",
    domain: "Chemical kinetics",
    skill: "Rate law from data",
    difficulty: "hard",
    stimulus:
      "For the reaction A + B giving products, three experiments are run at constant temperature. Doubling the concentration of A while holding B fixed doubles the initial rate. Doubling the concentration of B while holding A fixed leaves the initial rate unchanged.",
    questionText: "What is the overall order of the reaction?",
    choices: mc("First order", "Second order", "Zero order", "Third order"),
    correct: "A",
    explanation:
      "Rate is proportional to the concentration of A to the first power, since doubling A doubles the rate, and to B to the power zero, since changing B does nothing. The overall order is the sum of the exponents, 1 plus 0, so first order. A reactant that appears in the balanced equation but not in the rate law is entering after the rate-determining step, which is a real and common result rather than an oddity.",
  },
  {
    section: "chemistry",
    domain: "Electrochemistry",
    skill: "Cell potential and spontaneity",
    difficulty: "hard",
    stimulus:
      "A galvanic cell is assembled from a zinc electrode in zinc sulfate and a copper electrode in copper sulfate. The standard reduction potentials are minus 0.76 V for the zinc half-cell and plus 0.34 V for the copper half-cell.",
    questionText: "What is the standard cell potential?",
    choices: mc("+1.10 V", "-1.10 V", "+0.42 V", "-0.42 V"),
    correct: "A",
    explanation:
      "The more positive reduction potential is reduced, so copper is the cathode and zinc is oxidised at the anode. The cell potential is the cathode value minus the anode value: 0.34 minus minus 0.76, which is plus 1.10 V. The plus 0.42 option comes from adding the two potentials instead of subtracting, and a negative answer would mean the cell runs the other way -- which cannot be right for a spontaneous galvanic cell.",
  },
  {
    section: "chemistry",
    domain: "Organic chemistry",
    skill: "Reaction sequence",
    difficulty: "hard",
    stimulus:
      "Propene is treated with hydrogen bromide in the absence of peroxides. The product is then treated with alcoholic potassium hydroxide.",
    questionText: "What is the final organic product?",
    choices: mc("Propene", "Propan-2-ol", "1-bromopropane", "Propyne"),
    correct: "A",
    explanation:
      "Addition of HBr follows Markovnikov's rule without peroxides, putting the bromine on the more substituted carbon and giving 2-bromopropane. Alcoholic potassium hydroxide then favours elimination over substitution, removing HBr and regenerating propene. The sequence returns to where it started, which is the point of the question: the reagent and solvent together decide whether you get elimination or substitution, and aqueous KOH on the same intermediate would have given propan-2-ol instead.",
  },
  {
    section: "chemistry",
    domain: "Equilibrium",
    skill: "Equilibrium constant",
    difficulty: "hard",
    stimulus:
      "For the reaction in which 2 moles of HI decompose into hydrogen and iodine, 1 mole of HI is placed in a 1 litre vessel and allowed to reach equilibrium. At equilibrium 0.2 moles of HI have decomposed.",
    questionText: "What is the value of the equilibrium constant Kc?",
    choices: mc("0.0156", "0.25", "0.04", "0.125"),
    correct: "A",
    explanation:
      "Decomposing 0.2 mol of HI produces 0.1 mol each of hydrogen and iodine and leaves 0.8 mol of HI. Kc is the product concentrations over the reactant concentration with the coefficients as exponents: 0.1 times 0.1 divided by 0.8 squared, which is 0.01 over 0.64, so 0.0156. Forgetting that the coefficient of 2 becomes a square in the denominator is what produces the larger values offered.",
  },

  /* ------------------------------------------------------ Mathematics */
  {
    section: "mathematics",
    domain: "Calculus",
    skill: "Maxima and minima",
    difficulty: "hard",
    stimulus:
      "A rectangular box with a square base and no lid is to be made from 300 square centimetres of material.",
    questionText: "What base edge length maximises the volume?",
    choices: mc("10 cm", "5 cm", "15 cm", "20 cm"),
    correct: "A",
    explanation:
      "With base edge x and height h, the material is x squared plus 4xh equal to 300, so h is (300 minus x squared) over 4x. The volume is x squared h, which simplifies to 75x minus x cubed over 4. Setting the derivative 75 minus three quarters x squared to zero gives x squared equal to 100, so x is 10 cm. The step worth carrying away is eliminating h using the constraint before differentiating -- trying to differentiate two variables at once is where this question is usually lost.",
  },
  {
    section: "mathematics",
    domain: "Probability",
    skill: "Bayes' theorem",
    difficulty: "hard",
    stimulus:
      "Two bags are identical in appearance. Bag one contains 3 red and 2 blue balls; bag two contains 1 red and 4 blue balls. A bag is chosen at random and one ball is drawn from it. The ball is red.",
    questionText: "What is the probability that it came from bag one?",
    choices: mc("3/4", "1/2", "3/5", "1/4"),
    correct: "A",
    explanation:
      "Each bag is equally likely, so the chance of picking bag one and drawing red is a half times three fifths, which is 0.3, while bag two gives a half times one fifth, which is 0.1. Red happens 0.4 of the time in total, and bag one accounts for 0.3 of that, so the answer is 0.3 over 0.4, which is three quarters. Answering 3/5 gives the probability of red GIVEN bag one -- the conditional the question hands you, not the reversed one it asks for, and telling those two apart is the entire point of Bayes.",
  },
  {
    section: "mathematics",
    domain: "Coordinate geometry",
    skill: "Circles and tangents",
    difficulty: "hard",
    stimulus:
      "A circle has equation x squared plus y squared minus 4x minus 6y plus 9 equal to zero.",
    questionText: "What is the radius of this circle?",
    choices: mc("2", "3", "4", "9"),
    correct: "A",
    explanation:
      "Complete the square in both variables: x squared minus 4x becomes (x minus 2) squared minus 4, and y squared minus 6y becomes (y minus 3) squared minus 9. Substituting gives (x minus 2) squared plus (y minus 3) squared equal to 4, so the centre is (2, 3) and the radius is the square root of 4, which is 2. Answering 4 stops at the value on the right-hand side and forgets to take the root.",
  },
  {
    section: "mathematics",
    domain: "Sequences and series",
    skill: "Infinite geometric series",
    difficulty: "hard",
    stimulus:
      "An infinite geometric series has first term a and common ratio r, with the absolute value of r less than 1. Its sum is 12, and the sum of the squares of its terms is 48.",
    questionText: "What is the value of the common ratio r?",
    choices: mc("1/2", "1/3", "2/3", "1/4"),
    correct: "A",
    explanation:
      "The sum gives a over (1 minus r) equal to 12. The squared terms form their own geometric series with first term a squared and ratio r squared, so a squared over (1 minus r squared) equals 48. Substituting a as 12(1 minus r) into the second equation and cancelling leaves 144(1 minus r) over (1 plus r) equal to 48, so 3(1 minus r) equals 1 plus r, giving r as one half. Recognising that the squares form their own geometric progression is the whole question.",
  },
];
