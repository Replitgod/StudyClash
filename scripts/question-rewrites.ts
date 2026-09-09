// Hand-rewritten answer options for the questions the quality audit flagged.
//
// lib/server/questionQuality.ts found two systematic problems, and both let a
// student answer without knowing anything:
//
//   1. On the SAT evidence and inference items the key was a careful, precise
//      sentence and the distractors were throwaways -- "The study lasted
//      eight weeks", "Farmers markets are seasonal". Picking the longest
//      option scored 100 percent on that whole set. A real evidence item
//      makes every option a genuine finding from the passage; the wrong ones
//      fail because they do not ISOLATE the variable, not because they are
//      visibly irrelevant.
//
//   2. Absolutes used as a crutch -- "Libraries should never charge fines
//      under any circumstances", "Historians never revisit old assumptions".
//      Nobody picks those, so a four-option question was really a two-option
//      one.
//
// Keyed by database id, which is unambiguous. scripts/apply-rewrites.ts turns
// these into a migration keyed on (stimulus, question_text), which is what
// makes the change portable to any database.

export type Rewrite = {
  id: string;
  /** Why it was flagged, for whoever reads the diff. */
  note: string;
  choices: Array<{ id: string; text: string }>;
  correct: string;
  explanation?: string;
};

export const REWRITES: Rewrite[] = [
  /* ------------------------------------------------- SAT: central ideas */
  {
    id: "37832f69-417d-406d-a761-af94ad2b84e6",
    note: "Distractors were study trivia plus an absurd absolute about library fines.",
    choices: [
      { id: "A", text: "Patrons returned eighteen percent more books on time after the switch." },
      { id: "B", text: "Staff reported that patrons seemed less anxious about visiting at all." },
      { id: "C", text: "Replacing fines with reminder texts was followed by better returns and calmer patrons." },
      { id: "D", text: "Six months passed between the change and the staff's observations." },
    ],
    correct: "C",
    explanation:
      "A main-idea question wants the claim the whole passage supports, not one finding inside it. The higher on-time returns and the reduced anxiety are the two pieces of evidence for that claim, and the six-month gap is a detail of timing. A true detail is still the wrong answer to this question.",
  },
  {
    id: "40bfad88-f698-4153-8798-2f75adee49c8",
    note: "Two distractors were absurd absolutes nobody would pick.",
    choices: [
      { id: "A", text: "The town's trade revenue had been falling for twenty years before the plague arrived." },
      { id: "B", text: "A new overland route bypassed the town and helped drive its decline before the plague." },
      { id: "C", text: "The plague reached the town later than historians had previously assumed." },
      { id: "D", text: "Tax and trade records are the most reliable source for medieval town histories." },
    ],
    correct: "B",
    explanation:
      "The passage complicates a plague-only explanation by naming a second, earlier cause. The twenty-year decline is the evidence for that claim rather than the claim itself; the timing of the plague's arrival is never discussed; and the historian uses tax records without arguing they are the best kind of source.",
  },
  {
    id: "58374ffc-63de-4e1b-a32e-231a93ae5393",
    note: "Distractors were an absolute and an off-topic generalization.",
    choices: [
      { id: "A", text: "New nurses in the mentorship program left within a year at less than half the previous rate." },
      { id: "B", text: "The hospital paired each new nurse with a mentor for their first ninety days." },
      { id: "C", text: "Turnover among experienced nurses fell over the same period." },
      { id: "D", text: "New nurses reported feeling more confident after ninety days on the unit." },
    ],
    correct: "A",
    explanation:
      "The main idea is the outcome the passage reports: turnover among new nurses roughly halved alongside the program. The pairing is the intervention rather than the finding, and the other two are plausible results the passage never measures -- it says nothing about experienced nurses or about confidence.",
  },

  /* -------------------------------------------------- SAT: inferences */
  {
    id: "f71e876e-82bf-4c40-9926-7fa819e97579",
    note: "Key was twice the length of any distractor; one distractor was an absolute.",
    choices: [
      { id: "A", text: "Something about the mornings the video played was linked to the jams." },
      { id: "B", text: "The barista on duty determined whether the machine jammed." },
      { id: "C", text: "The machine jammed at unpredictable intervals through the week." },
      { id: "D", text: "Playing the video made the baristas work less carefully." },
    ],
    correct: "A",
    explanation:
      "The jams tracked the video regardless of which barista worked, so the barista is ruled out and the mornings the video played are what remain. Choice D names a specific mechanism the passage gives no evidence for, and an inference question asks what the pattern supports rather than what could explain it.",
  },
  {
    id: "d7c1b288-9284-484f-aa67-775c73b4102a",
    note: "Key was 40 characters longer than any distractor.",
    choices: [
      { id: "A", text: "The supervisor's presence, rather than the workers or products, tracked the defect rate." },
      { id: "B", text: "The workers on the supervisor's shifts were more experienced than the others." },
      { id: "C", text: "Defect rates rose during the vacation because equipment went unmaintained." },
      { id: "D", text: "Certain products were more likely to be made on the supervisor's shifts." },
    ],
    correct: "A",
    explanation:
      "The passage rules out the workers and the products explicitly -- the pattern held regardless of both -- which leaves the supervisor's presence. Choices B and D are the two explanations the passage has already eliminated, and choice C invents a mechanism nothing supports.",
  },
  {
    id: "c0cb5f2f-e12b-410a-882d-d4bc028c61da",
    note: "Key was nearly twice the length of the distractors.",
    choices: [
      { id: "A", text: "The reporting method, rather than crews or budget, tracked how fast a pothole was fixed." },
      { id: "B", text: "App reports came from residents living closer to the potholes they reported." },
      { id: "C", text: "The city assigned its faster crews to app-reported potholes." },
      { id: "D", text: "Potholes reported by phone were in less accessible parts of the city." },
    ],
    correct: "A",
    explanation:
      "The same crews and the same budget covered both kinds of report, so neither can explain the gap and the reporting method is what remains. The other three are plausible-sounding alternatives, and each contradicts a condition the passage states.",
  },
  {
    id: "c2bdd284-92f6-421f-9a13-a7386d1fce10",
    note: "Key was nearly twice the length of the distractors.",
    choices: [
      { id: "A", text: "Recent rain, rather than the season or which fox was present, tracked the tolerance." },
      { id: "B", text: "The foxes had grown used to the photographer over several seasons." },
      { id: "C", text: "One particular fox was more tolerant than the rest of the family." },
      { id: "D", text: "The foxes allowed closer approach during one season than the others." },
    ],
    correct: "A",
    explanation:
      "The pattern held regardless of season and regardless of which fox was nearby, and the passage states both -- which rules out choices C and D directly. Choice B would predict a gradual change over time rather than a clean split between wet and dry mornings.",
  },

  /* ---------------------------------------------------- SAT: evidence */
  {
    id: "0c599a56-ff23-4d2b-9f92-abfa06318ab2",
    note: "Distractors were study-design trivia: duration, sample size.",
    choices: [
      { id: "A", text: "Turtles avoided high-traffic areas even where food was abundant." },
      { id: "B", text: "Turtles were tracked along the route for three consecutive years." },
      { id: "C", text: "Forty turtles were tagged, enough to average out individual variation." },
      { id: "D", text: "Turtles moved freely through low-traffic areas that held little food." },
    ],
    correct: "A",
    explanation:
      "The conclusion singles out engine noise over food scarcity, so the evidence has to separate the two. Only avoidance despite abundant food does that: the food was there and the turtles still stayed away. Choice D leaves both explanations standing, and sample size and duration say how confident the study is rather than what it found.",
  },
  {
    id: "1ca0f24a-9f26-40b3-8fdf-c336f952e416",
    note: "Distractors restated the setup instead of reporting findings.",
    choices: [
      { id: "A", text: "The reviewing class scored ten points higher despite covering identical material." },
      { id: "B", text: "Both classes covered the same material in the week before the quiz." },
      { id: "C", text: "Students who reviewed said they felt better prepared for the quiz." },
      { id: "D", text: "The reviewing class had also scored higher on the previous quiz." },
    ],
    correct: "A",
    explanation:
      "The claim is that the review, not the teaching, produced the gap, so the evidence must hold the teaching constant and still show a difference. Choice B holds it constant but reports no difference. Choice D actively undermines the claim -- a class already ahead may owe nothing to the review -- and how students felt is not a score.",
  },
  {
    id: "ba334f2b-3a43-4783-9940-e7381f21878e",
    note: "Distractors were assertions about measurement and about planners.",
    choices: [
      { id: "A", text: "The neighborhoods matched on income and density, yet only the plaza one gained revenue." },
      { id: "B", text: "Restaurant revenue in the plaza neighborhood rose twenty percent over two years." },
      { id: "C", text: "Both neighborhoods were tracked across the same two-year period." },
      { id: "D", text: "The neighborhood without a plaza started with slightly fewer restaurants." },
    ],
    correct: "A",
    explanation:
      "Only the first option names the comparison that rules the alternatives out: the two neighborhoods matched on income and density and still diverged. Choice B is the result with nothing to compare it against, and choice D introduces a difference between them, which weakens the argument rather than supporting it.",
  },
  {
    id: "439cb43b-148f-4d10-90f3-070b16275f34",
    note: "Distractors were duration, grouping and measurement trivia.",
    choices: [
      { id: "A", text: "Both groups, with and without standing desks, showed similar energy improvements." },
      { id: "B", text: "The group given standing desks reported no real change in daily step count." },
      { id: "C", text: "Reported energy levels improved across the eight weeks of the study." },
      { id: "D", text: "Workers given standing desks spent more of the day on their feet." },
    ],
    correct: "A",
    explanation:
      "The conclusion is that the desks were NOT the driver, and a negative claim is supported by showing the outcome appeared without the cause. Both groups improving similarly does exactly that. Choice B is about steps rather than energy, choice C reports the improvement without saying who had it, and choice D would support the opposite conclusion.",
  },
  {
    id: "714c3fe4-5332-4c92-b364-e681527dce8c",
    note: "Distractors restated the setup and remarked on researchers.",
    choices: [
      { id: "A", text: "Both groups had similar screen time and bedtimes, yet filter users fell asleep faster." },
      { id: "B", text: "Filter users fell asleep an average of eleven minutes faster than non-users." },
      { id: "C", text: "Participants in both groups used their phones in the hour before bed." },
      { id: "D", text: "Filter users reported going to bed slightly earlier than non-users." },
    ],
    correct: "A",
    explanation:
      "The claim singles out the filter over screen time and bedtime, so the evidence has to hold those constant. Choice B gives the result without ruling anything out, and choice D breaks the very control the claim depends on -- if the filter group also went to bed earlier, bedtime is back in play.",
  },
  {
    id: "f7fff46c-30dd-4ff8-b584-bd2e5d84698a",
    note: "One distractor was \"Farmers markets are seasonal\", unconnected to the claim.",
    choices: [
      { id: "A", text: "Card-accepting markets took thirty percent more per visit despite similar vendors and goods." },
      { id: "B", text: "Markets that accepted cards saw average per-visit spending rise by thirty percent." },
      { id: "C", text: "The two groups of markets sold a similar range of goods." },
      { id: "D", text: "Card-accepting markets tended to sit in wealthier neighborhoods." },
    ],
    correct: "A",
    explanation:
      "The argument needs vendor variety held constant and spending still differing, which is what the first option states. Choices B and C are the two halves of that on their own, and neither alone rules the other explanation out. Choice D supplies a rival explanation and works against the claim.",
  },

  /* ------------------------------------------ SAT: rhetorical synthesis */
  {
    id: "7f4c0823-284a-4e2a-a8a1-c71d26aecb89",
    note: "Only the key combined two notes; the rest were bare single notes.",
    choices: [
      { id: "A", text: "Unlike the library's earlier, ungoverned shelf, the program has cut unreturned tools." },
      { id: "B", text: "The program lends power tools on a library card, with no membership fee." },
      { id: "C", text: "A safety video is required before a first checkout, unlike under the old shelf." },
      { id: "D", text: "Tools are checked out like books, a process members already know." },
    ],
    correct: "A",
    explanation:
      "The goal is to show the program improved on what came before, which needs both a comparison and an outcome. Choice C makes the comparison but names a rule rather than a result; choices B and D describe the program without reference to the old shelf at all.",
  },
  {
    id: "6c50dd7b-cf2f-49d9-8199-6834fc0b79bc",
    note: "Only the key combined two notes; the rest were bare single notes.",
    choices: [
      { id: "A", text: "Weekly output held within two percent even as overtime requests dropped by half." },
      { id: "B", text: "Overtime requests dropped by half after the factory moved to four days." },
      { id: "C", text: "Redesigned shift handoffs kept output within two percent of the old schedule." },
      { id: "D", text: "Weekly output held steady, though some long-time employees missed the routine." },
    ],
    correct: "A",
    explanation:
      "The argument has two halves -- productivity held, and it held without more overtime -- so the sentence has to carry both. Choice B has only the overtime, choice C credits the handoffs rather than the schedule, and choice D pairs the output with an unrelated complaint.",
  },

  /* --------------------------------------------------------- SAT: math */
  // A stem of eleven characters tests whether a student remembers a rule.
  // Asking for the result in exponent form tests whether they know WHICH
  // rule, because every wrong option is a different rule applied.
  {
    id: "70552dbf-0adf-4df6-8d82-b3071ffd1ebd",
    note: "Bare arithmetic: \"What is the value of 2^3 * 2^2?\"",
    choices: [
      { id: "A", text: "2^5" },
      { id: "B", text: "2^6" },
      { id: "C", text: "4^5" },
      { id: "D", text: "4^6" },
    ],
    correct: "A",
    explanation:
      "Multiplying powers of the same base adds the exponents, so 2^3 times 2^2 is 2^(3+2) = 2^5, or 32. Choice B multiplies the exponents instead of adding them, and the two base-4 options come from multiplying the bases together as well -- the base does not change when powers are multiplied.",
  },
  {
    id: "d5e5e1ce-f0fd-4265-83ce-48ed14c68639",
    note: "Bare arithmetic stem.",
    choices: [
      { id: "A", text: "3^2" },
      { id: "B", text: "3^6" },
      { id: "C", text: "3^8" },
      { id: "D", text: "1^2" },
    ],
    correct: "A",
    explanation:
      "Dividing powers of the same base subtracts the exponents: 3^4 divided by 3^2 is 3^(4-2) = 3^2, or 9. Choice B adds them, choice C multiplies them, and choice D divides the bases as well -- the base is unchanged by division.",
  },
  {
    id: "d285276b-65ec-4854-a8c3-d837cc34b697",
    note: "Bare arithmetic stem.",
    choices: [
      { id: "A", text: "2^10" },
      { id: "B", text: "2^7" },
      { id: "C", text: "2^25" },
      { id: "D", text: "4^5" },
    ],
    correct: "A",
    explanation:
      "A power raised to a power multiplies the exponents, so (2^5)^2 is 2^(5x2) = 2^10, or 1024. Choice B adds them, which is the rule for multiplying two powers rather than raising one to a power, and choice D squares the base instead of applying the outer exponent to the whole expression.",
  },
];
