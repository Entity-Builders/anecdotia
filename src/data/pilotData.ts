import type {
  PilotCircle,
  PilotData,
  PilotPerson,
  PilotStory,
  VisibilityMode,
} from '../domain/types';

const DEFAULT_CIRCLE: PilotCircle = {
  id: 'obrach',
  displayName: 'Familia Obrach',
  landingTitle: 'Anecdotario de la familia Obrach',
};

const DEFAULT_PEOPLE: PilotPerson[] = [
  {
    localId: 'person-001',
    displayName: 'Elena Obradora',
    aliases: ['Elenita', 'Abuela Elena'],
    relationshipHint: 'Persona de muestra para validar sugerencias',
    status: 'unknown',
  },
  {
    localId: 'person-002',
    displayName: 'Ruben Costa',
    aliases: ['Rube', 'Tio Ruben'],
    relationshipHint: 'Persona de muestra para validar sugerencias',
    status: 'unknown',
  },
  {
    localId: 'person-003',
    displayName: 'Marta Flores',
    aliases: ['Martita'],
    relationshipHint: 'Persona de muestra para validar sugerencias',
    status: 'unknown',
  },
];

const DEFAULT_SEED_STORIES: PilotStory[] = [
  {
    id: 'seed-001',
    title: 'La frase de la mesa larga',
    text: 'Cada reunion terminaba con Elena diciendo que siempre habia lugar para uno mas. La frase volvia cada vez que aparecia alguien sin avisar.',
    personIds: ['person-001'],
    visibility: 'family-circle',
    subjectType: 'person',
    primaryPersonId: 'person-001',
    sourceLabel: 'Historia de muestra',
    source: 'seed',
    createdAt: '2026-06-26T00:00:00.000Z',
    canOthersAddVersions: true,
    responseCount: 0,
  },
  {
    id: 'seed-002',
    title: 'El viaje que se conto mil veces',
    text: 'Ruben repetia la historia del viaje en auto como si hubiera pasado ayer. Cada version tenia un detalle nuevo y todos discutian cual era el real.',
    personIds: ['person-002'],
    visibility: 'family-circle',
    subjectType: 'person',
    primaryPersonId: 'person-002',
    sourceLabel: 'Historia de muestra',
    source: 'seed',
    createdAt: '2026-06-26T00:00:00.000Z',
    canOthersAddVersions: true,
    responseCount: 0,
  },
];

const fetchTextIfPresent = async (path: string): Promise<string | null> => {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const text = await response.text();
    const trimmed = text.trim();

    if (!trimmed || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
};

const parseRosterJson = (
  rosterText: string | null,
): { circle: PilotCircle; people: PilotPerson[] } | null => {
  if (!rosterText) return null;

  try {
    const parsed = JSON.parse(rosterText) as {
      circle?: PilotCircle;
      people?: PilotPerson[];
    };

    if (!parsed.circle || !Array.isArray(parsed.people)) return null;

    return {
      circle: parsed.circle,
      people: parsed.people,
    };
  } catch {
    return null;
  }
};

const sanitizePeople = (people: PilotPerson[]): PilotPerson[] =>
  people.map((person) => ({
    localId: person.localId,
    displayName: person.displayName,
    aliases: Array.isArray(person.aliases) ? person.aliases : [],
    relationshipHint: person.relationshipHint,
    status: person.status,
  }));

const parseVisibility = (value: string): VisibilityMode => {
  if (value.includes('creator-only')) return 'creator-only';
  if (value.includes('selected-members')) return 'selected-members';
  return 'family-circle';
};

const readField = (section: string, label: string): string => {
  const fieldStart = section.indexOf(`${label}:`);
  if (fieldStart === -1) return '';

  const afterLabel = section.slice(fieldStart + label.length + 1);
  const nextField = afterLabel.search(
    /\n(?:Title|Story text|Mentioned people|Visibility|Source|Can others add versions):/u,
  );

  return (nextField === -1 ? afterLabel : afterLabel.slice(0, nextField))
    .replace(/^- /gm, '')
    .trim();
};

const parseMentionedPeople = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.replace(/[`-]/g, '').trim())
    .filter(Boolean);

export const parseSeedAnecdotesMarkdown = (markdown: string): PilotStory[] => {
  const sections = markdown
    .split(/\n## /u)
    .slice(1)
    .map((section) => `## ${section}`);

  return sections
    .map((section, index): PilotStory | null => {
      const title = readField(section, 'Title');
      const text = readField(section, 'Story text');
      if (!title || !text) return null;

      const mentionedPeople = parseMentionedPeople(
        readField(section, 'Mentioned people'),
      );
      const visibility = parseVisibility(readField(section, 'Visibility'));
      const sourceLabel = readField(section, 'Source') || 'Familia';
      const canOthersAddVersions = !readField(
        section,
        'Can others add versions',
      )
        .toLowerCase()
        .includes('no');

      return {
        id: `seed-${String(index + 1).padStart(3, '0')}`,
        title,
        text,
        personIds: mentionedPeople,
        visibility,
        subjectType: mentionedPeople.length === 1 ? 'person' : undefined,
        primaryPersonId:
          mentionedPeople.length === 1 ? mentionedPeople[0] : undefined,
        sourceLabel,
        source: 'seed',
        createdAt: '2026-06-26T00:00:00.000Z',
        canOthersAddVersions,
        responseCount: 0,
      } satisfies PilotStory;
    })
    .filter((story): story is PilotStory => story !== null);
};

export const loadPilotData = async (): Promise<PilotData> => {
  const rosterPath =
    import.meta.env.VITE_ANECDOTIA_PRIVATE_DATA_PATH ||
    '/pilot-data/roster.obrach.local.json';
  const seedStoriesPath =
    import.meta.env.VITE_ANECDOTIA_PRIVATE_SEED_STORIES_PATH ||
    '/pilot-data/seed-anecdotes.obrach.local.md';

  const rosterText = await fetchTextIfPresent(rosterPath);
  const parsedRoster = parseRosterJson(rosterText);

  const seedStoriesText = await fetchTextIfPresent(seedStoriesPath);
  const seedStories = seedStoriesText
    ? parseSeedAnecdotesMarkdown(seedStoriesText)
    : DEFAULT_SEED_STORIES;

  return {
    circle: parsedRoster?.circle || DEFAULT_CIRCLE,
    people: sanitizePeople(parsedRoster?.people || DEFAULT_PEOPLE),
    seedStories: seedStories.length > 0 ? seedStories : DEFAULT_SEED_STORIES,
  };
};
