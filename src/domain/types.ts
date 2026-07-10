export type VisibilityMode =
  | 'creator-only'
  | 'family-circle'
  | 'selected-members';

export type PersonStatus = 'living' | 'deceased' | 'unknown';

export type StorySubjectType = 'person' | 'multiple_people' | 'topic';

export type PilotCircle = {
  id: string;
  displayName: string;
  landingTitle: string;
};

export type PilotPerson = {
  localId: string;
  displayName: string;
  aliases: string[];
  relationshipHint?: string;
  status?: PersonStatus;
};

export type StorySource = 'seed' | 'local';

export type PilotStory = {
  id: string;
  title: string;
  text: string;
  personIds: string[];
  visibility: VisibilityMode;
  subjectType?: StorySubjectType;
  primaryPersonId?: string;
  topicLabel?: string;
  isSensitive?: boolean;
  sourceLabel: string;
  source: StorySource;
  createdAt: string;
  canOthersAddVersions: boolean;
  responseCount: number;
};

export type PilotData = {
  circle: PilotCircle;
  people: PilotPerson[];
  seedStories: PilotStory[];
};

export type PersonSuggestion = {
  person: PilotPerson;
  matchedAliases: string[];
  matchReason: string;
  score: number;
};

export type DraftStory = {
  text: string;
  personIds: string[];
  visibility: VisibilityMode | null;
  subjectType: StorySubjectType | null;
  primaryPersonId: string | null;
  topicLabel: string;
  isSensitive: boolean;
};
