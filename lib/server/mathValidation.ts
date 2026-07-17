// Shared by every AI question-generation route. Prompts instruct the model
// to wrap math in $...$ (inline) or $$...$$ (display) LaTeX delimiters --
// app/components/ui/MathText.tsx renders those. An unclosed delimiter
// renders as broken/garbled text (stray "$" characters mixed with
// unrendered LaTeX source) instead of failing loudly, so this has to be
// caught in validation rather than surfacing as a silent quality bug
// downstream. Not a full LaTeX parser -- just delimiter balance, which
// catches the actual failure mode (the model dropping a closing "$").
export function hasUnbalancedMathDelimiters(text: string): boolean {
  const withoutDisplayBlocks = text.replace(/\$\$[\s\S]*?\$\$/g, "");
  if (withoutDisplayBlocks.includes("$$")) return true;
  const remainingDollarCount = (withoutDisplayBlocks.match(/\$/g) || []).length;
  return remainingDollarCount % 2 !== 0;
}
