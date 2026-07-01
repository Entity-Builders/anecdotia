import type { PilotPerson, PilotStory, VisibilityMode } from '../domain/types';

const STORIES_KEY = 'anecdotia:local-stories:v1';
const PEOPLE_KEY = 'anecdotia:local-people:v1';

type StoredStory = PilotStory;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const safeJsonParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const loadLocalStories = (): PilotStory[] => {
  const storage = getStorage();
  if (!storage) return [];

  return safeJsonParse<StoredStory[]>(storage.getItem(STORIES_KEY), []);
};

export const loadLocalPeople = (): PilotPerson[] => {
  const storage = getStorage();
  if (!storage) return [];

  return safeJsonParse<PilotPerson[]>(storage.getItem(PEOPLE_KEY), []);
};

export const saveLocalPeople = (people: PilotPerson[]): void => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(PEOPLE_KEY, JSON.stringify(people));
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `story-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createTitle = (text: string): string => {
  const firstLine = text.trim().split(/\n+/u)[0] || 'Nueva anecdota';
  const firstSentence = firstLine.split(/[.!?]/u)[0] || firstLine;
  return firstSentence.length > 58
    ? `${firstSentence.slice(0, 55).trim()}…`
    : firstSentence;
};

export const saveLocalStory = ({
  text,
  personIds,
  visibility,
}: {
  text: string;
  personIds: string[];
  visibility: VisibilityMode;
}): PilotStory => {
  const storage = getStorage();
  const existing = loadLocalStories();
  const story: PilotStory = {
    id: createId(),
    title: createTitle(text),
    text: text.trim(),
    personIds,
    visibility,
    sourceLabel: 'Guardada en este dispositivo',
    source: 'local',
    createdAt: new Date().toISOString(),
    canOthersAddVersions: true,
    responseCount: 0,
  };

  if (storage) {
    storage.setItem(STORIES_KEY, JSON.stringify([story, ...existing]));
  }

  return story;
};
