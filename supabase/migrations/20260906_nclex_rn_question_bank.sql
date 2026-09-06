-- An original NCLEX-RN-style question bank.
--
-- /exams has advertised NCLEX since it was written, and until now clicking
-- it went to a page whose only button went to /home. There was not an
-- exam_definitions row, let alone a question.
--
-- Every item below was written for this migration. None of it reproduces,
-- paraphrases or is derived from any NCSBN item -- those are secure, and a
-- product that shipped them would deserve everything that followed. What is
-- taken from NCSBN is the published 2026 test plan: the eight content areas,
-- their share of the exam, and the six steps of the Clinical Judgement
-- Measurement Model. A test plan is public; an item bank is not.
--
-- Domain names are the content areas exactly as the test plan words them,
-- including "Safety and Infection Prevention and Control", which the 2026
-- plan renamed from "Safety and Infection Control". A candidate who sees a
-- category here should see the same words in their own review book.
--
-- Item counts follow the plan's percentages rather than being spread evenly:
-- Pharmacological and Parenteral Therapies is the largest single area on the
-- real exam and is the largest here.
--
-- Two things every rationale does, because on this exam they are the whole
-- point: it says WHY the right option is right in terms of a principle the
-- candidate can reuse, and it says why the tempting wrong one is wrong.
-- "Maslow" and "ABCs" and "acute over chronic" are the reusable parts; the
-- specific patient is not.
--
-- AceDecks is exam preparation. Nothing here is clinical advice, and no
-- score here predicts a pass.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

  -- ============== Management of Care ==============

  ('nclex_rn', 'Management of Care', 'Prioritization', 'easy', 'multiple_choice',
    null,
    'A nurse begins a shift with four assigned clients. Which client should the nurse assess first?',
    '[{"id":"A","text":"A client who is two hours postoperative and reports incisional pain rated 6 out of 10"},{"id":"B","text":"A client with new-onset shortness of breath and an oxygen saturation of 88 percent on room air"},{"id":"C","text":"A client scheduled for discharge who has questions about a new medication"},{"id":"D","text":"A client with a chronic pressure injury due for a dressing change"}]',
    'B', 'Airway and breathing come before everything else. A saturation of 88 percent with new shortness of breath is an oxygenation problem that will worsen without intervention. The postoperative pain is expected and treatable but not immediately life-threatening, the discharge teaching can wait, and a chronic wound is stable by definition. The reusable principle: acute beats chronic, and within acute, the ABCs decide the order.'),

  ('nclex_rn', 'Management of Care', 'Delegation', 'easy', 'multiple_choice',
    null,
    'Which task is appropriate for a registered nurse to delegate to unlicensed assistive personnel?',
    '[{"id":"A","text":"Assessing a client''s lung sounds before ambulation"},{"id":"B","text":"Teaching a client how to use an incentive spirometer"},{"id":"C","text":"Measuring and recording vital signs for a stable client"},{"id":"D","text":"Evaluating a client''s response to a new pain medication"}]',
    'C', 'Delegation transfers a task, never the nursing process. Assessment, teaching and evaluation all require nursing judgement and cannot be delegated; measuring vital signs on a stable client is a routine, predictable task with a clear expected outcome. The reusable test: if the task requires judging what the finding means, it stays with the nurse.'),

  ('nclex_rn', 'Management of Care', 'Informed consent', 'medium', 'multiple_choice',
    null,
    'A client scheduled for surgery tells the nurse, "I signed the form, but I still do not understand what they are actually removing." What should the nurse do first?',
    '[{"id":"A","text":"Explain the surgical procedure to the client in simple terms"},{"id":"B","text":"Notify the surgeon that the client has questions about the procedure"},{"id":"C","text":"Reassure the client that the surgeon will explain everything beforehand"},{"id":"D","text":"Document that the client is anxious and continue preparing for surgery"}]',
    'B', 'Informed consent is the responsibility of the provider performing the procedure; the nurse witnesses the signature and confirms understanding. A client who does not understand has not given informed consent, so the surgeon must return. Explaining the procedure oversteps the nurse''s role, and reassurance and documentation both leave an invalid consent in place.'),

  ('nclex_rn', 'Management of Care', 'Prioritization', 'medium', 'multiple_choice',
    null,
    'A nurse receives report on four clients. Which client requires the most immediate attention?',
    '[{"id":"A","text":"A client with a potassium level of 6.8 mEq/L"},{"id":"B","text":"A client with a hemoglobin of 9.2 g/dL"},{"id":"C","text":"A client with a temperature of 38.1 degrees Celsius"},{"id":"D","text":"A client with a blood glucose of 210 mg/dL"}]',
    'A', 'A potassium of 6.8 mEq/L is severe hyperkalemia and carries an immediate risk of lethal dysrhythmia -- it is a cardiac emergency, not a laboratory abnormality. The other three are all abnormal and all need attention, but none of them will stop a heart in the next few minutes. The reusable principle: rank abnormal values by how fast they kill, not by how far they are from normal.'),

  ('nclex_rn', 'Management of Care', 'Scope of practice', 'medium', 'multiple_choice',
    null,
    'A registered nurse is assigning clients on a medical unit that includes a licensed practical nurse. Which client is most appropriate to assign to the LPN?',
    '[{"id":"A","text":"A client admitted one hour ago who needs an initial admission assessment"},{"id":"B","text":"A client with stable heart failure who needs daily weights and oral medications"},{"id":"C","text":"A client receiving a first dose of intravenous antibiotic"},{"id":"D","text":"A client whose plan of care needs revision after a change in condition"}]',
    'B', 'An LPN cares for stable clients with predictable outcomes. The initial admission assessment, the first dose of a medication that could cause a reaction, and revising a care plan all require RN assessment and judgement. Stable heart failure with routine weights and oral medication is exactly the predictable case an LPN manages.'),

  ('nclex_rn', 'Management of Care', 'Advocacy', 'medium', 'multiple_choice',
    null,
    'A client with decision-making capacity refuses a blood transfusion for religious reasons despite a hemoglobin of 6.5 g/dL. What is the nurse''s most appropriate action?',
    '[{"id":"A","text":"Administer the transfusion because the client''s life is at risk"},{"id":"B","text":"Ask a family member to sign the consent instead"},{"id":"C","text":"Document the refusal, notify the provider, and support the client''s decision"},{"id":"D","text":"Explain that the refusal will be overridden by the hospital ethics committee"}]',
    'C', 'A client with capacity has the right to refuse any treatment, including one that is life-sustaining, and administering it anyway is battery. The nurse documents, informs the provider so alternatives can be discussed, and supports the client. A family member cannot consent for a client who has capacity, and no ethics committee overrides a capable refusal.'),

  ('nclex_rn', 'Management of Care', 'Continuity of care', 'hard', 'multiple_choice',
    null,
    'During handoff, the off-going nurse reports that a client "had a rough night." Which response by the receiving nurse is most appropriate?',
    '[{"id":"A","text":"“Thank you, I will keep an eye on them.”"},{"id":"B","text":"“Can you tell me specifically what happened and what was done about it?”"},{"id":"C","text":"“I will read the notes when I get a chance.”"},{"id":"D","text":"“Did the provider come to see the client?”"}]',
    'B', 'Handoff is the highest-risk moment in a hospital stay, and a vague summary is a communication failure the receiving nurse can still repair by asking for specifics: what happened, what was done, what the response was. Accepting the vagueness, deferring to the chart, or asking a single narrow question all leave the gap in place.'),

  ('nclex_rn', 'Management of Care', 'Confidentiality', 'hard', 'multiple_choice',
    null,
    'A client''s adult sibling telephones the unit and asks for an update on the client''s condition. What should the nurse do?',
    '[{"id":"A","text":"Provide a general update since the caller is an immediate family member"},{"id":"B","text":"Confirm whether the client has authorized the release of information to this person"},{"id":"C","text":"Refuse to acknowledge that the client is in the facility under any circumstances"},{"id":"D","text":"Transfer the call to the provider so that they can decide"}]',
    'B', 'Being a relative does not by itself authorize disclosure, so the nurse verifies whether this caller is someone the client has authorized. A blanket refusal to acknowledge that the client is in the facility goes further than the law requires and is only correct when the client has opted out of the directory; handing the call to the provider passes the problem along without solving it. The distinction worth keeping: protecting information is always required, pretending the client does not exist is not.'),

  ('nclex_rn', 'Management of Care', 'Prioritization', 'hard', 'multiple_response',
    null,
    'A charge nurse is preparing to evacuate a unit during a fire on an adjacent floor. Which clients should be moved first? Select all that apply.',
    '[{"id":"A","text":"An ambulatory client who can walk without assistance"},{"id":"B","text":"A client who can walk with a walker and standby assistance"},{"id":"C","text":"A client on a ventilator requiring manual bagging to move"},{"id":"D","text":"A client in skeletal traction"},{"id":"E","text":"A client sleeping after receiving a sedative"}]',
    'A,B', 'Evacuation moves ambulatory clients first, because each one moved frees a staff member and clears the corridor for the difficult transfers that follow. The ventilated client, the client in traction and the sedated client all require more staff and more time, and moving them first would strand the people who could have walked out unaided.'),

  ('nclex_rn', 'Management of Care', 'Referrals', 'easy', 'multiple_choice',
    null,
    'A client being discharged after a stroke has difficulty swallowing thin liquids. Which referral is most appropriate for the nurse to initiate?',
    '[{"id":"A","text":"Speech-language pathology"},{"id":"B","text":"Physical therapy"},{"id":"C","text":"Respiratory therapy"},{"id":"D","text":"Social work"}]',
    'A', 'Swallowing evaluation and dysphagia management belong to speech-language pathology. Physical therapy addresses mobility, respiratory therapy addresses ventilation and airway clearance, and social work addresses discharge resources -- all of which this client may also need, but none of which assesses a swallow.'),

  -- ============== Safety and Infection Prevention and Control ==============

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Transmission-based precautions', 'easy', 'multiple_choice',
    null,
    'A client is admitted with suspected pulmonary tuberculosis. Which precautions should the nurse implement?',
    '[{"id":"A","text":"Contact precautions in a private room"},{"id":"B","text":"Droplet precautions with a surgical mask"},{"id":"C","text":"Airborne precautions in a negative-pressure room with an N95 respirator"},{"id":"D","text":"Standard precautions only until culture results return"}]',
    'C', 'Tuberculosis spreads on droplet nuclei small enough to stay suspended in air, which is what makes it airborne rather than droplet: it needs a negative-pressure room and a fitted N95, not a surgical mask. Precautions are started on suspicion, not on confirmation, so waiting for cultures exposes everyone in the meantime.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Hand hygiene', 'easy', 'multiple_choice',
    null,
    'A nurse is caring for a client with Clostridioides difficile infection. Which hand hygiene method should the nurse use after client contact?',
    '[{"id":"A","text":"Alcohol-based hand rub"},{"id":"B","text":"Soap and water"},{"id":"C","text":"Alcohol-based hand rub followed by gloves"},{"id":"D","text":"Antiseptic wipe"}]',
    'B', 'C. difficile forms spores, and alcohol does not kill spores -- it needs the physical removal that soap and running water provide. This is the reason a unit with a C. difficile outbreak switches to soap and water despite alcohol rub being faster and easier on the hands everywhere else.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Fall prevention', 'easy', 'multiple_choice',
    null,
    'Which intervention is most effective for reducing the risk of falls in an older adult hospitalized client?',
    '[{"id":"A","text":"Keeping all four side rails raised at all times"},{"id":"B","text":"Ensuring the call light is within reach and the bed is in the lowest position"},{"id":"C","text":"Restricting the client to bed rest"},{"id":"D","text":"Applying a soft waist restraint at night"}]',
    'B', 'Reachable call light and a low bed reduce both the chance of an unassisted attempt and the injury if one happens. Four raised side rails are legally a restraint and increase injury when a client climbs over them; bed rest causes the deconditioning that makes the next fall likelier; and restraints are a last resort, never a first-line fall intervention.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Medication safety', 'medium', 'multiple_choice',
    null,
    'A nurse is preparing to administer a medication and notices that the dose ordered is three times the usual adult dose. What should the nurse do?',
    '[{"id":"A","text":"Administer the dose as written since the provider ordered it"},{"id":"B","text":"Administer the usual dose instead and document the change"},{"id":"C","text":"Hold the medication and contact the prescriber to clarify the order"},{"id":"D","text":"Ask another nurse whether the dose seems reasonable and proceed if they agree"}]',
    'C', 'A nurse who recognizes a questionable order is obligated to clarify it before administering, and carrying out an order known to be unsafe transfers liability to the nurse. Changing the dose independently is prescribing, which is outside the nurse''s scope, and a colleague''s opinion does not substitute for the prescriber''s clarification.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Personal protective equipment', 'medium', 'multiple_choice',
    null,
    'When removing personal protective equipment after caring for a client on contact precautions, which item should the nurse remove first?',
    '[{"id":"A","text":"Gown"},{"id":"B","text":"Gloves"},{"id":"C","text":"Mask"},{"id":"D","text":"Eye protection"}]',
    'B', 'Gloves are removed first because they are the most contaminated item and everything else is removed with hands that have touched them otherwise. The sequence runs gloves, then eye protection, then gown, then mask, and the mask comes off last because it is removed outside the room.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Restraints', 'medium', 'multiple_choice',
    null,
    'A client in restraints requires assessment. How often should the nurse assess a client in violent or self-destructive behavioral restraints who is an adult?',
    '[{"id":"A","text":"Every 15 minutes"},{"id":"B","text":"Every 30 minutes"},{"id":"C","text":"Every hour"},{"id":"D","text":"Every 2 hours"}]',
    'A', 'Behavioral restraints for violent or self-destructive behavior carry the highest risk of injury and require the most frequent monitoring, at 15-minute intervals for an adult. Non-violent medical restraints are assessed less often, which is the distinction this question is built on -- the reason for the restraint sets the frequency, not the device.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Client identification', 'medium', 'multiple_response',
    null,
    'Which identifiers may a nurse use to verify a client''s identity before administering a medication? Select all that apply.',
    '[{"id":"A","text":"The client''s full name"},{"id":"B","text":"The client''s date of birth"},{"id":"C","text":"The client''s room number"},{"id":"D","text":"The client''s medical record number"},{"id":"E","text":"The client''s bed position on the unit"}]',
    'A,B,D', 'Two identifiers are required and neither may be location-based, because a client can be moved. Name, date of birth and medical record number travel with the person; room number and bed position describe furniture, and using them is how a medication reaches the wrong client after a transfer.'),

  ('nclex_rn', 'Safety and Infection Prevention and Control', 'Surgical asepsis', 'hard', 'multiple_choice',
    null,
    'A nurse is setting up a sterile field and turns away briefly to answer a colleague''s question. What should the nurse do?',
    '[{"id":"A","text":"Continue using the field, since nothing visibly contaminated it"},{"id":"B","text":"Cover the field with a sterile drape and continue"},{"id":"C","text":"Consider the field contaminated and set up a new one"},{"id":"D","text":"Use only the center of the field, which remains sterile"}]',
    'C', 'A sterile field that is out of the setter''s sight is considered contaminated, whether or not anything is seen to touch it. Sterility is a status maintained by continuous observation, not a property judged by appearance -- which is why "it looked fine" is never the standard.'),

  -- ============== Health Promotion and Maintenance ==============

  ('nclex_rn', 'Health Promotion and Maintenance', 'Developmental stages', 'easy', 'multiple_choice',
    null,
    'A parent asks when an infant is typically able to sit without support. Which response by the nurse is accurate?',
    '[{"id":"A","text":"Around 2 months"},{"id":"B","text":"Around 4 months"},{"id":"C","text":"Around 6 to 8 months"},{"id":"D","text":"Around 12 months"}]',
    'C', 'Unsupported sitting typically appears between 6 and 8 months. At 2 months an infant is achieving head control, at 4 months rolling begins, and by 12 months most infants are pulling to stand and cruising -- so the earlier options describe skills that come before and the later one a skill that comes after.'),

  ('nclex_rn', 'Health Promotion and Maintenance', 'Prenatal care', 'medium', 'multiple_choice',
    null,
    'A client who is 32 weeks pregnant reports a severe headache, visual changes, and swelling of the hands and face. What is the nurse''s priority action?',
    '[{"id":"A","text":"Advise rest in a darkened room and recheck in the morning"},{"id":"B","text":"Assess blood pressure and notify the provider immediately"},{"id":"C","text":"Reassure the client that headaches are common in the third trimester"},{"id":"D","text":"Recommend an over-the-counter analgesic"}]',
    'B', 'Headache, visual changes and facial edema after 20 weeks are the classic warning signs of preeclampsia, which can progress to seizure. Blood pressure is the assessment that confirms the suspicion, and the provider must be told at once. Every other option treats a warning sign as a comfort problem and sends the client home with an untreated hypertensive disorder.'),

  ('nclex_rn', 'Health Promotion and Maintenance', 'Health screening', 'medium', 'multiple_choice',
    null,
    'A nurse is teaching a group of adults about colorectal cancer screening. Which statement indicates that teaching was effective?',
    '[{"id":"A","text":"“Screening should start at 45 for people at average risk.”"},{"id":"B","text":"“Screening is only needed if someone in my family had colon cancer.”"},{"id":"C","text":"“A colonoscopy is needed every year regardless of the result.”"},{"id":"D","text":"“Screening can stop as soon as I turn 50.”"}]',
    'A', 'Average-risk colorectal screening now begins at 45. Family history raises risk and may move the start earlier, but its absence does not remove the need; colonoscopy intervals depend on findings rather than being annual; and 50 is a starting point in older guidance, never a stopping point.'),

  ('nclex_rn', 'Health Promotion and Maintenance', 'Immunizations', 'easy', 'multiple_choice',
    null,
    'A client is scheduled to receive a live attenuated vaccine. Which finding in the client''s history requires the nurse to hold the vaccine and consult the provider?',
    '[{"id":"A","text":"A mild upper respiratory infection without fever"},{"id":"B","text":"Current pregnancy"},{"id":"C","text":"A history of vaccination two years ago"},{"id":"D","text":"A family member who is also pregnant"}]',
    'B', 'Live vaccines are contraindicated in pregnancy because of theoretical risk to the fetus. A mild illness without fever is not a reason to defer any vaccine, prior vaccination is history rather than contraindication, and a pregnant household contact is a precaution for some live vaccines but not a contraindication for the client.'),

  ('nclex_rn', 'Health Promotion and Maintenance', 'Aging', 'hard', 'multiple_choice',
    null,
    'Which finding in an 80-year-old client should the nurse investigate rather than attribute to normal aging?',
    '[{"id":"A","text":"Slower reaction time on a timed task"},{"id":"B","text":"New confusion developing over two days"},{"id":"C","text":"Reduced skin elasticity"},{"id":"D","text":"Decreased near vision requiring reading glasses"}]',
    'B', 'Acute confusion is delirium until proved otherwise, and it is a symptom of something else -- infection, hypoxia, a medication, a metabolic derangement -- not of being 80. Slowed reaction time, reduced skin elasticity and presbyopia are all expected age-related changes. The reusable rule: normal aging is gradual, and anything that appears over hours to days is a new problem.'),

  -- ============== Psychosocial Integrity ==============

  ('nclex_rn', 'Psychosocial Integrity', 'Therapeutic communication', 'easy', 'multiple_choice',
    null,
    'A client newly diagnosed with cancer says, "I do not think I can go through with this treatment." Which response by the nurse is most therapeutic?',
    '[{"id":"A","text":"“You have to do the treatment or the cancer will spread.”"},{"id":"B","text":"“Tell me what worries you most about the treatment.”"},{"id":"C","text":"“Everyone feels that way at first. You will be fine.”"},{"id":"D","text":"“Would you like me to call the chaplain?”"}]',
    'B', 'An open-ended invitation keeps the client talking and finds out what the fear actually is, which is the only route to addressing it. Warning about consequences uses fear as a lever, false reassurance dismisses the feeling, and offering a referral closes the conversation before anyone knows what is wrong.'),

  ('nclex_rn', 'Psychosocial Integrity', 'Suicide risk', 'medium', 'multiple_choice',
    null,
    'A client on an inpatient unit states, "I have figured out how to end things, and I have what I need at home." What is the nurse''s priority action?',
    '[{"id":"A","text":"Document the statement and continue the assessment"},{"id":"B","text":"Ask the client directly about the plan and initiate continuous observation"},{"id":"C","text":"Reassure the client that things will improve with treatment"},{"id":"D","text":"Notify the family so they can remove items from the home"}]',
    'B', 'A stated plan with available means is a high-risk disclosure requiring immediate safety measures, and asking directly about the plan does not increase risk -- that belief is the single most persistent myth on this topic. Documentation, reassurance and family notification all matter, but none of them keeps the client safe in the next five minutes.'),

  ('nclex_rn', 'Psychosocial Integrity', 'Substance withdrawal', 'medium', 'multiple_choice',
    null,
    'A client admitted 48 hours ago after stopping heavy daily alcohol use develops tremors, tachycardia, and visual hallucinations. What should the nurse anticipate?',
    '[{"id":"A","text":"That symptoms will resolve without intervention within a few hours"},{"id":"B","text":"That the client is experiencing alcohol withdrawal and requires urgent treatment"},{"id":"C","text":"That the client has an underlying psychotic disorder"},{"id":"D","text":"That the client is seeking additional medication"}]',
    'B', 'Tremor, tachycardia and hallucinations peaking around 48 hours after the last drink is the picture of alcohol withdrawal, which can progress to seizures and delirium tremens and carries real mortality untreated. Waiting it out is dangerous, and attributing the presentation to a psychiatric diagnosis or to drug-seeking misses a medical emergency.'),

  ('nclex_rn', 'Psychosocial Integrity', 'Grief', 'medium', 'multiple_choice',
    null,
    'A client whose spouse died three weeks ago tells the nurse, "I still set out two cups of coffee every morning." Which response is most appropriate?',
    '[{"id":"A","text":"“That sounds like it is time to talk to someone about your grief.”"},{"id":"B","text":"“It takes time. What is that morning like for you?”"},{"id":"C","text":"“You should try to change your routine to help you move on.”"},{"id":"D","text":"“Many people do that. It is completely normal.”"}]',
    'B', 'Three weeks out, this is ordinary grief rather than a complication, and the response both normalizes it briefly and opens the door to the client saying more. Suggesting professional help pathologizes normal grief, telling the client to change the routine directs behaviour nobody asked about, and closing with "completely normal" ends the conversation.'),

  ('nclex_rn', 'Psychosocial Integrity', 'De-escalation', 'hard', 'multiple_choice',
    null,
    'A client on a psychiatric unit is pacing, speaking loudly, and clenching their fists. What is the nurse''s most appropriate initial action?',
    '[{"id":"A","text":"Approach closely and place a hand on the client''s shoulder"},{"id":"B","text":"Speak calmly from a non-threatening distance and offer to talk in a quieter area"},{"id":"C","text":"Call security to place the client in restraints"},{"id":"D","text":"Ignore the behaviour so as not to reinforce it"}]',
    'B', 'De-escalation begins with a calm voice, personal space and an offer that gives the client a choice, and it works far more often than anything that follows it. Touch at this stage is likely to be read as a threat, restraints are a last resort after less restrictive measures fail, and ignoring escalating agitation lets it escalate.'),

  -- ============== Basic Care and Comfort ==============

  ('nclex_rn', 'Basic Care and Comfort', 'Nutrition', 'easy', 'multiple_choice',
    null,
    'A client is receiving continuous enteral tube feeding. Which nursing action best reduces the risk of aspiration?',
    '[{"id":"A","text":"Keeping the head of the bed elevated at least 30 degrees"},{"id":"B","text":"Flushing the tube with 30 mL of water every 8 hours"},{"id":"C","text":"Warming the formula before administration"},{"id":"D","text":"Changing the feeding bag every 48 hours"}]',
    'A', 'Elevating the head of the bed uses gravity to keep formula in the stomach and is the single most effective aspiration precaution during tube feeding. Flushing maintains patency, warming improves comfort, and bag changes control infection -- all worth doing, and none of them about aspiration.'),

  ('nclex_rn', 'Basic Care and Comfort', 'Mobility', 'easy', 'multiple_choice',
    null,
    'A nurse is teaching a client to use a cane after a right knee injury. Which instruction is correct?',
    '[{"id":"A","text":"“Hold the cane in your right hand and move it with your right leg.”"},{"id":"B","text":"“Hold the cane in your left hand and move it forward with your right leg.”"},{"id":"C","text":"“Hold the cane in whichever hand feels comfortable.”"},{"id":"D","text":"“Hold the cane in your right hand and move it with your left leg.”"}]',
    'B', 'A cane is held on the strong side and advances together with the weak leg, so weight is shared between the cane and the good leg while the injured one is loaded. Holding it on the injured side gives no offloading, and comfort is not the criterion -- the mechanics are.'),

  ('nclex_rn', 'Basic Care and Comfort', 'Elimination', 'medium', 'multiple_choice',
    null,
    'A client with an indwelling urinary catheter has no urine output for the past two hours. What should the nurse do first?',
    '[{"id":"A","text":"Irrigate the catheter with sterile saline"},{"id":"B","text":"Check the tubing for kinks and ensure the bag is below bladder level"},{"id":"C","text":"Notify the provider that the client is anuric"},{"id":"D","text":"Remove the catheter and reinsert a new one"}]',
    'B', 'Assess before intervening. A kinked tube or a bag hung above the bladder is the commonest and most easily fixed cause of an apparently dry catheter, and it takes seconds to rule out. Irrigating, reinserting or reporting anuria all act on a conclusion that has not been reached yet.'),

  ('nclex_rn', 'Basic Care and Comfort', 'Pain management', 'medium', 'multiple_choice',
    null,
    'A postoperative client rates pain as 8 out of 10 but is smiling and talking with visitors. What should the nurse do?',
    '[{"id":"A","text":"Reassess the pain rating, since the client does not appear to be in pain"},{"id":"B","text":"Administer the prescribed analgesic based on the client''s report"},{"id":"C","text":"Document that the client''s report is inconsistent with observed behaviour"},{"id":"D","text":"Offer a non-pharmacological measure instead"}]',
    'B', 'Pain is whatever the client says it is. Behaviour is an unreliable indicator -- people distract themselves, mask discomfort in front of visitors, and adapt to chronic pain -- so treating the report is correct. Each other option substitutes the nurse''s observation for the client''s report, which is the definition of undertreating pain.'),

  ('nclex_rn', 'Basic Care and Comfort', 'Sleep', 'hard', 'multiple_choice',
    null,
    'An older adult client reports difficulty sleeping in the hospital. Which nursing intervention should the nurse implement first?',
    '[{"id":"A","text":"Request a prescription for a sedative-hypnotic"},{"id":"B","text":"Cluster nursing care to reduce nighttime interruptions"},{"id":"C","text":"Encourage a daytime nap to make up the lost sleep"},{"id":"D","text":"Offer caffeinated tea in the evening for comfort"}]',
    'B', 'Non-pharmacological measures come first, and in a hospital the biggest single cause of broken sleep is being woken by staff. Sedative-hypnotics in older adults raise the risk of falls, delirium and next-day sedation; daytime napping reduces night-time sleep drive; and caffeine in the evening works against the goal.'),

  -- ============== Pharmacological and Parenteral Therapies ==============

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Anticoagulants', 'easy', 'multiple_choice',
    null,
    'A client receiving warfarin has an INR of 6.2. What should the nurse anticipate?',
    '[{"id":"A","text":"Increasing the warfarin dose"},{"id":"B","text":"Holding the warfarin and preparing to administer vitamin K"},{"id":"C","text":"Administering protamine sulfate"},{"id":"D","text":"No change, since this INR is therapeutic"}]',
    'B', 'Therapeutic INR for most indications is 2 to 3, so 6.2 is a serious bleeding risk. Warfarin is held and vitamin K is the reversal agent. Protamine sulfate reverses heparin, not warfarin -- pairing each anticoagulant with its own antidote is the point of the question.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Digoxin', 'easy', 'multiple_choice',
    null,
    'Before administering digoxin, the nurse counts an apical pulse of 52 beats per minute in an adult client. What should the nurse do?',
    '[{"id":"A","text":"Administer the dose as scheduled"},{"id":"B","text":"Hold the dose and notify the provider"},{"id":"C","text":"Administer half the dose"},{"id":"D","text":"Recheck the radial pulse and administer if it is above 60"}]',
    'B', 'Digoxin slows conduction, so it is held in an adult when the apical rate is below 60 and the prescriber is notified. Splitting a dose is prescribing, and a radial pulse is less reliable than an apical one in a client who may have a pulse deficit -- checking the easier site to get the answer you want is the trap here.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Insulin', 'medium', 'multiple_choice',
    null,
    'A client receives regular insulin at 0730. At what time should the nurse be most alert for hypoglycemia?',
    '[{"id":"A","text":"0745 to 0800"},{"id":"B","text":"0930 to 1130"},{"id":"C","text":"1400 to 1600"},{"id":"D","text":"1900 to 2100"}]',
    'B', 'Regular insulin peaks roughly 2 to 4 hours after a subcutaneous dose, which places the highest hypoglycemia risk from about 0930 to 1130. Fifteen minutes after the dose is barely past onset, and the later windows fall outside the peak for this insulin -- matching each insulin to its own peak is what makes the timing question answerable.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Antibiotics', 'medium', 'multiple_choice',
    null,
    'A client receiving intravenous vancomycin develops flushing of the face and neck during infusion. What should the nurse do first?',
    '[{"id":"A","text":"Stop the infusion and prepare to administer epinephrine"},{"id":"B","text":"Slow the infusion rate and notify the provider"},{"id":"C","text":"Continue the infusion and document the finding"},{"id":"D","text":"Administer the remaining dose as a rapid bolus"}]',
    'B', 'Flushing during vancomycin infusion is an infusion-rate reaction caused by histamine release rather than a true allergy, and slowing the rate is the correct first response. Epinephrine is for anaphylaxis, which this is not; continuing unchanged lets it worsen; and a rapid bolus is exactly what causes it.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Dosage calculation', 'medium', 'student_produced_response',
    null,
    'A provider prescribes 750 mg of an antibiotic. The pharmacy supplies a vial containing 250 mg per 5 mL. How many milliliters should the nurse administer?',
    null, '15', 'Set up the proportion 250 mg / 5 mL = 750 mg / x. Cross-multiplying gives 250x = 3750, so x = 15 mL. Checking the direction: the ordered dose is three times what is in 5 mL, so the volume must be three times 5 mL.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Dosage calculation', 'hard', 'student_produced_response',
    null,
    'A client weighing 70 kg is prescribed a medication at 0.5 mg per kg per dose. The medication is supplied as 10 mg per mL. How many milliliters should the nurse administer per dose?',
    null, '3.5', 'The dose is 0.5 mg/kg times 70 kg, which is 35 mg. At 10 mg per mL, 35 mg is 3.5 mL. Dividing the weight by the concentration first is the usual error and gives an answer with no meaningful units.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Opioids', 'medium', 'multiple_choice',
    null,
    'A client receiving intravenous morphine has a respiratory rate of 7 breaths per minute and is difficult to arouse. Which medication should the nurse anticipate administering?',
    '[{"id":"A","text":"Flumazenil"},{"id":"B","text":"Naloxone"},{"id":"C","text":"Acetylcysteine"},{"id":"D","text":"Protamine sulfate"}]',
    'B', 'Naloxone reverses opioid-induced respiratory depression. Flumazenil reverses benzodiazepines, acetylcysteine treats acetaminophen overdose, and protamine reverses heparin -- this question is really asking whether the antidote is matched to the drug class rather than to the symptom.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Medication teaching', 'medium', 'multiple_response',
    null,
    'A client is starting an angiotensin-converting enzyme inhibitor. Which statements should the nurse include in teaching? Select all that apply.',
    '[{"id":"A","text":"A dry, persistent cough may develop and should be reported"},{"id":"B","text":"Rise slowly from sitting or lying to reduce dizziness"},{"id":"C","text":"Use a potassium-based salt substitute to reduce sodium intake"},{"id":"D","text":"Report any swelling of the face, lips, or tongue immediately"},{"id":"E","text":"Stop the medication as soon as blood pressure is normal"}]',
    'A,B,D', 'ACE inhibitors cause a dry cough through bradykinin accumulation, cause orthostatic hypotension particularly at the start, and can cause angioedema, which is an airway emergency. They also raise potassium, so potassium-based salt substitutes are contraindicated, and hypertension treatment is ongoing -- stopping when the number normalizes is why the number stops being normal.'),

  ('nclex_rn', 'Pharmacological and Parenteral Therapies', 'Intravenous therapy', 'hard', 'multiple_choice',
    null,
    'A nurse notices that the skin around a peripheral intravenous site is cool, pale, and swollen, and the infusion has slowed. What is the nurse''s first action?',
    '[{"id":"A","text":"Flush the catheter with saline to restore flow"},{"id":"B","text":"Stop the infusion and remove the catheter"},{"id":"C","text":"Apply warm compresses and continue the infusion"},{"id":"D","text":"Elevate the extremity and increase the infusion rate"}]',
    'B', 'Cool, pale, swollen tissue with a slowing infusion is infiltration: fluid is entering the tissue rather than the vein. The infusion stops and the catheter comes out before anything else. Flushing pushes more fluid into the tissue, and continuing or speeding the infusion makes the injury larger.'),

  -- ============== Reduction of Risk Potential ==============

  ('nclex_rn', 'Reduction of Risk Potential', 'Laboratory values', 'easy', 'multiple_choice',
    null,
    'Which laboratory result should the nurse report to the provider immediately for a client receiving heparin?',
    '[{"id":"A","text":"Platelet count of 68,000 per microliter"},{"id":"B","text":"Hemoglobin of 13.5 g/dL"},{"id":"C","text":"White blood cell count of 8,000 per microliter"},{"id":"D","text":"Sodium of 138 mEq/L"}]',
    'A', 'A falling platelet count in a client on heparin raises the possibility of heparin-induced thrombocytopenia, which paradoxically causes clotting rather than bleeding and requires the heparin to be stopped. The other three values are all within normal limits and would not be reported as abnormal at all.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Procedures', 'medium', 'multiple_choice',
    null,
    'A client is scheduled for a bronchoscopy. Which nursing action is essential after the procedure?',
    '[{"id":"A","text":"Offer fluids as soon as the client is awake"},{"id":"B","text":"Withhold food and fluids until the gag reflex returns"},{"id":"C","text":"Ambulate the client immediately to prevent atelectasis"},{"id":"D","text":"Position the client flat on the back"}]',
    'B', 'The topical anesthetic used for bronchoscopy suppresses the gag reflex, so anything swallowed before it returns can be aspirated. Fluids are withheld until the reflex is confirmed. Immediate ambulation is unnecessary, and lying flat after airway instrumentation works against airway protection.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Diagnostic tests', 'medium', 'multiple_choice',
    null,
    'A client is scheduled for a contrast-enhanced computed tomography scan. Which finding should the nurse report to the provider before the procedure?',
    '[{"id":"A","text":"A serum creatinine of 2.4 mg/dL"},{"id":"B","text":"A blood pressure of 128 over 76"},{"id":"C","text":"A reported allergy to latex"},{"id":"D","text":"A history of appendectomy"}]',
    'A', 'Iodinated contrast is nephrotoxic, and an elevated creatinine signals impaired kidney function that makes contrast-induced nephropathy far likelier. The blood pressure is normal, latex allergy matters for gloves and equipment rather than for contrast, and a past appendectomy has no bearing on the scan.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Complications', 'medium', 'multiple_choice',
    null,
    'A client who had abdominal surgery two days ago reports sudden shortness of breath and pleuritic chest pain. What should the nurse suspect?',
    '[{"id":"A","text":"Pulmonary embolism"},{"id":"B","text":"Wound dehiscence"},{"id":"C","text":"Paralytic ileus"},{"id":"D","text":"Urinary retention"}]',
    'A', 'Sudden dyspnea with pleuritic chest pain in a postoperative, relatively immobile client is pulmonary embolism until proved otherwise. Dehiscence presents as a wound separating, ileus as absent bowel sounds and distension, and retention as a distended bladder -- none of them produce this respiratory picture.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Monitoring', 'hard', 'multiple_choice',
    null,
    'A client has a chest tube connected to a water-seal drainage system. The nurse observes continuous vigorous bubbling in the water-seal chamber. What does this most likely indicate?',
    '[{"id":"A","text":"Normal functioning of the system"},{"id":"B","text":"An air leak in the system"},{"id":"C","text":"Complete lung re-expansion"},{"id":"D","text":"Obstruction of the chest tube"}]',
    'B', 'Intermittent bubbling in the water-seal chamber with respiration is expected; continuous vigorous bubbling means air is entering the system from somewhere it should not, and the nurse traces the tubing for a leak. Full re-expansion produces the opposite finding -- bubbling and tidaling stop -- and an obstruction produces no bubbling at all.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Laboratory values', 'hard', 'multiple_response',
    null,
    'A client has a serum sodium of 118 mEq/L. Which findings should the nurse expect to assess? Select all that apply.',
    '[{"id":"A","text":"Confusion"},{"id":"B","text":"Seizures"},{"id":"C","text":"Headache"},{"id":"D","text":"Intense thirst with dry mucous membranes"},{"id":"E","text":"Hyperreflexia with muscle cramping"}]',
    'A,B,C', 'Severe hyponatremia pulls water into cells, and the cells that matter are in the brain -- so the presentation is neurological: headache, confusion, and at this level seizures. Intense thirst with dry membranes is the picture of hypernatremia, the opposite disorder, and hyperreflexia with cramping points to calcium and magnesium problems rather than sodium.'),

  ('nclex_rn', 'Reduction of Risk Potential', 'Vital signs', 'easy', 'multiple_choice',
    null,
    'A client''s blood pressure drops from 128/78 to 88/52 one hour after starting a new antihypertensive. What should the nurse do first?',
    '[{"id":"A","text":"Recheck the blood pressure and assess the client for symptoms"},{"id":"B","text":"Administer the next scheduled dose as ordered"},{"id":"C","text":"Place the client in high Fowler position"},{"id":"D","text":"Document the reading and reassess in four hours"}]',
    'A', 'Confirm the finding and assess the client before acting on a single reading -- a mis-cuffed or mis-timed measurement is common, and what the client looks like decides how urgent this is. Giving the next dose acts on an unconfirmed number in the wrong direction, sitting the client up lowers the pressure further, and waiting four hours is too long if the reading is real.'),

  -- ============== Physiological Adaptation ==============

  ('nclex_rn', 'Physiological Adaptation', 'Fluid and electrolytes', 'easy', 'multiple_choice',
    null,
    'A client with heart failure has gained 2.5 kg in three days. What does this finding most likely indicate?',
    '[{"id":"A","text":"Improved nutritional intake"},{"id":"B","text":"Fluid retention"},{"id":"C","text":"Increased muscle mass"},{"id":"D","text":"Measurement error"}]',
    'B', 'A kilogram is roughly a litre of fluid, so 2.5 kg in three days is fluid, not tissue -- nobody builds two and a half kilograms of muscle or fat in seventy-two hours. Daily weights are the most sensitive routine measure of fluid status in heart failure for exactly this reason.'),

  ('nclex_rn', 'Physiological Adaptation', 'Respiratory', 'medium', 'multiple_choice',
    null,
    'A client with chronic obstructive pulmonary disease has an oxygen saturation of 90 percent on 2 litres per minute by nasal cannula. What should the nurse do?',
    '[{"id":"A","text":"Increase the oxygen to 6 litres per minute"},{"id":"B","text":"Continue the current oxygen and monitor the client"},{"id":"C","text":"Remove the oxygen entirely"},{"id":"D","text":"Place the client on a non-rebreather mask"}]',
    'B', 'A saturation of 88 to 92 percent is an acceptable target in COPD, so 90 percent on 2 litres is where this client should be. Pushing the saturation higher can worsen carbon dioxide retention; removing oxygen abandons a client who needs it; and a non-rebreather is a large escalation with no indication here.'),

  ('nclex_rn', 'Physiological Adaptation', 'Cardiac', 'medium', 'multiple_choice',
    null,
    'A client reports crushing substernal chest pain radiating to the left arm. After ensuring the client is safe, which action should the nurse take first?',
    '[{"id":"A","text":"Obtain a 12-lead electrocardiogram"},{"id":"B","text":"Draw cardiac biomarkers"},{"id":"C","text":"Administer a stool softener"},{"id":"D","text":"Schedule an echocardiogram"}]',
    'A', 'The electrocardiogram is the fastest test that changes management, because ST-segment elevation starts a reperfusion clock immediately. Biomarkers take time to rise and to result, an echocardiogram is not the first-line test for acute coronary syndrome, and a stool softener is a comfort measure with no bearing on the emergency.'),

  ('nclex_rn', 'Physiological Adaptation', 'Endocrine', 'medium', 'multiple_choice',
    null,
    'A client with type 1 diabetes has a blood glucose of 480 mg/dL, deep rapid respirations, and a fruity odor on the breath. What should the nurse anticipate?',
    '[{"id":"A","text":"Administering oral glucose"},{"id":"B","text":"Initiating intravenous fluids and an insulin infusion"},{"id":"C","text":"Withholding all fluids until glucose normalizes"},{"id":"D","text":"Administering a subcutaneous long-acting insulin dose only"}]',
    'B', 'This is diabetic ketoacidosis, and treatment is fluid resuscitation plus a regular insulin infusion -- volume depletion is usually the more immediately dangerous half. Oral glucose treats the opposite problem, withholding fluids worsens the dehydration driving the picture, and long-acting insulin alone acts far too slowly.'),

  ('nclex_rn', 'Physiological Adaptation', 'Neurological', 'hard', 'multiple_choice',
    null,
    'A client with a head injury has a blood pressure of 178/62, a pulse of 48, and irregular respirations. What does the nurse recognize about these findings?',
    '[{"id":"A","text":"They indicate hypovolemic shock"},{"id":"B","text":"They indicate increasing intracranial pressure and require immediate provider notification"},{"id":"C","text":"They are an expected response to pain"},{"id":"D","text":"They indicate an infection"}]',
    'B', 'Widening pulse pressure, bradycardia and irregular respirations are Cushing triad, a late and ominous sign of rising intracranial pressure. Hypovolemic shock produces the reverse -- low pressure and a fast pulse -- and neither pain nor infection produces bradycardia with hypertension.'),

  ('nclex_rn', 'Physiological Adaptation', 'Renal', 'hard', 'multiple_choice',
    null,
    'A client with chronic kidney disease has a potassium of 6.4 mEq/L. Which intervention should the nurse anticipate first?',
    '[{"id":"A","text":"Administering intravenous calcium gluconate"},{"id":"B","text":"Encouraging a high-potassium diet"},{"id":"C","text":"Administering intravenous potassium chloride"},{"id":"D","text":"Withholding all intravenous fluids"}]',
    'A', 'Calcium gluconate does not lower potassium; it stabilizes the cardiac membrane against the arrhythmia that is the immediate threat, which is why it comes first while the potassium-lowering measures are prepared. Giving potassium or encouraging it in the diet worsens the problem, and withholding fluids does not address it.'),

  ('nclex_rn', 'Physiological Adaptation', 'Shock', 'hard', 'multiple_choice',
    null,
    'A client is admitted with a temperature of 39.2 degrees Celsius, a heart rate of 122, a blood pressure of 84/48, and a lactate of 4.2 mmol/L. What does the nurse recognize?',
    '[{"id":"A","text":"Cardiogenic shock"},{"id":"B","text":"Septic shock"},{"id":"C","text":"Neurogenic shock"},{"id":"D","text":"Anaphylactic shock"}]',
    'B', 'Fever, tachycardia, hypotension and a raised lactate together are septic shock -- the lactate is the marker of tissue hypoperfusion that separates sepsis from an ordinary febrile illness. Cardiogenic shock follows pump failure rather than infection, neurogenic shock presents with bradycardia rather than tachycardia, and anaphylaxis follows an exposure and brings airway and skin findings.'),

  ('nclex_rn', 'Physiological Adaptation', 'Fluid and electrolytes', 'medium', 'multiple_choice',
    null,
    'A client receiving intravenous fluids develops crackles in the lung bases, jugular venous distension, and a bounding pulse. What should the nurse do first?',
    '[{"id":"A","text":"Increase the infusion rate to improve perfusion"},{"id":"B","text":"Slow or stop the infusion and elevate the head of the bed"},{"id":"C","text":"Place the client flat to improve venous return"},{"id":"D","text":"Administer an additional fluid bolus"}]',
    'B', 'Crackles, jugular venous distension and a bounding pulse are fluid volume overload, so the first action is to stop adding fluid and to sit the client up to ease the work of breathing. Every other option adds volume or worsens the pulmonary congestion.')

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = 'nclex-rn'
on conflict (exam_id, md5(coalesce(stimulus, '') || chr(31) || question_text)) do nothing;

-- Available only now that there is a bank behind the card.
update public.exam_definitions
set status = 'available'
where slug = 'nclex-rn'
  and exists (
    select 1 from public.diagnostic_questions q
    where q.exam_id = exam_definitions.id and q.status = 'published'
  );
