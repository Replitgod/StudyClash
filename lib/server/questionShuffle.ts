// Without this, an AI-generated batch tends to place the correct answer in
// the same position more often than chance (models have a measurable
// positional bias), which a student can learn to exploit without knowing
// any actual material. Shuffling is safe post-validation because
// correct_answer is matched by exact string equality, not by index -- so
// reordering the array never invalidates which choice is "correct."
export function shuffleAnswerChoices(choices: string[]): string[] {
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
