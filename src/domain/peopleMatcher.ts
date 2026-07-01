import type { PersonSuggestion, PilotPerson } from './types';

const WORDISH = /[\p{L}\p{N}]+/gu;

export const normalizeForMatch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(WORDISH)
    ?.join(' ')
    .trim() || '';

const containsPhrase = (text: string, phrase: string): boolean => {
  if (!phrase) return false;

  const phraseTokens = phrase.split(' ').filter(Boolean);
  if (phraseTokens.length === 0) return false;

  const textWithBoundaries = ` ${text} `;
  const phraseWithBoundaries = ` ${phraseTokens.join(' ')} `;

  return textWithBoundaries.includes(phraseWithBoundaries);
};

const getPersonAliases = (person: PilotPerson): string[] => {
  const aliases = [person.displayName, ...person.aliases]
    .map(normalizeForMatch)
    .filter((alias) => alias.length >= 3);

  return Array.from(new Set(aliases));
};

export const findMentionedPeople = (
  transcript: string,
  people: PilotPerson[],
): PersonSuggestion[] => {
  const normalizedTranscript = normalizeForMatch(transcript);
  if (!normalizedTranscript) return [];

  return people
    .map((person) => {
      const matchedAliases = getPersonAliases(person).filter((alias) =>
        containsPhrase(normalizedTranscript, alias),
      );

      if (matchedAliases.length === 0) return null;

      const score = matchedAliases.reduce(
        (total, alias) => total + alias.split(' ').length,
        0,
      );

      return {
        person,
        matchedAliases,
        matchReason:
          matchedAliases.length === 1
            ? `Coincide con "${matchedAliases[0]}"`
            : `Coincide con ${matchedAliases.length} nombres o apodos`,
        score,
      } satisfies PersonSuggestion;
    })
    .filter((suggestion): suggestion is PersonSuggestion => suggestion !== null)
    .sort((a, b) => b.score - a.score || a.person.displayName.localeCompare(b.person.displayName));
};
