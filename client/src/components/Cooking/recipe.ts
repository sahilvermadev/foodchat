import type { SavedRecipe } from 'librechat-data-provider';

function isWrapperLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '{' || trimmed === '}';
}

function headingText(line: string): string {
  return line.replace(/^#{1,3}\s+/, '').trim();
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanRecipeMarkdown(markdown: string): string {
  const lines = markdown.trim().split('\n');
  while (lines.length > 0 && isWrapperLine(lines[0])) {
    lines.shift();
  }
  while (lines.length > 0 && isWrapperLine(lines[lines.length - 1])) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

export function recipeDisplayTitle(recipe: SavedRecipe): string {
  const title = recipe.title.trim();
  if (title && !isWrapperLine(title)) {
    return title;
  }

  const heading = cleanRecipeMarkdown(recipe.documentMarkdown)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  return heading ? headingText(heading) : 'Saved recipe';
}

export function recipeBodyMarkdown(recipe: SavedRecipe): string {
  const title = normalizeTitle(recipeDisplayTitle(recipe));
  const lines = cleanRecipeMarkdown(recipe.documentMarkdown).split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return '';
  }

  const firstContent = lines[firstContentIndex].trim();
  const isDuplicateHeading =
    /^#{1,3}\s+\S/.test(firstContent) && normalizeTitle(headingText(firstContent)) === title;

  if (!isDuplicateHeading) {
    return lines.join('\n').trim();
  }

  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    .join('\n')
    .trim();
}
