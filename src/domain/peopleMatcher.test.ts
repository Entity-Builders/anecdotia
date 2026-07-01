import { describe, expect, it } from 'vitest';
import { findMentionedPeople, normalizeForMatch } from './peopleMatcher';
import type { PilotPerson } from './types';

const people: PilotPerson[] = [
  {
    localId: 'person-001',
    displayName: 'Rosa Benitez',
    aliases: ['Rosita', 'Tia Rosa'],
  },
  {
    localId: 'person-002',
    displayName: 'Antonio Perez',
    aliases: ['Tono', 'Abuelo Antonio'],
  },
];

describe('peopleMatcher', () => {
  it('normalizes accents, punctuation, and spacing', () => {
    expect(normalizeForMatch('  Tía   Rosa, llegó! ')).toBe('tia rosa llego');
  });

  it('suggests people from display names and aliases', () => {
    const suggestions = findMentionedPeople(
      'Me acuerdo cuando tia Rosa y Tono preparaban la mesa.',
      people,
    );

    expect(suggestions.map((item) => item.person.localId)).toEqual([
      'person-001',
      'person-002',
    ]);
  });

  it('does not match partial words', () => {
    const suggestions = findMentionedPeople(
      'La rosaleda del patio era enorme.',
      people,
    );

    expect(suggestions).toEqual([]);
  });
});
