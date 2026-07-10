import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  Clipboard,
  GitBranch,
  HeartHandshake,
  Home,
  Lock,
  Menu,
  MessageCircle,
  Mic2,
  PenLine,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import landingCollageBoard from './assets/landing-collage-board.jpg';
import landingPeopleCard from './assets/landing-people-card.jpg';
import { loadPilotData } from './data/pilotData';
import {
  loadLocalPeople,
  loadLocalStories,
  saveLocalPeople,
  saveLocalStory,
} from './data/storyRepository';
import { findMentionedPeople } from './domain/peopleMatcher';
import type {
  DraftStory,
  PilotCircle,
  PersonSuggestion,
  PilotData,
  PilotPerson,
  PilotStory,
  StorySubjectType,
  VisibilityMode,
} from './domain/types';
import { analytics, trackAnecdotiaEvent } from './services/analytics';

type AppView =
  | 'landing'
  | 'capture'
  | 'people'
  | 'subject'
  | 'visibility'
  | 'saved'
  | 'library'
  | 'story'
  | 'person';

type Prompt = {
  id: string;
  label: string;
  body: string;
};

type VisibilityOption = {
  id: VisibilityMode;
  label: string;
  body: string;
  icon: typeof Lock;
};

type NarratorState =
  | 'idle'
  | 'prompting'
  | 'listening'
  | 'thinking'
  | 'privacy'
  | 'success'
  | 'map';

const EMPTY_DRAFT: DraftStory = {
  text: '',
  personIds: [],
  visibility: null,
  subjectType: null,
  primaryPersonId: null,
  topicLabel: '',
  isSensitive: false,
};

const PROMPTS: Prompt[] = [
  {
    id: 'repeated-story',
    label: 'Historia repetida',
    body: 'Una historia que siempre vuelve a aparecer en las reuniones.',
  },
  {
    id: 'family-phrase',
    label: 'Frase familiar',
    body: 'Una frase, dicho o costumbre que merezca sobrevivir.',
  },
  {
    id: 'person-memory',
    label: 'Alguien para recordar',
    body: 'Un recuerdo simple de una persona de la familia.',
  },
];

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    id: 'creator-only',
    label: 'Solo para mi',
    body: 'Queda guardada como borrador privado en este dispositivo.',
    icon: Lock,
  },
  {
    id: 'family-circle',
    label: 'Familia',
    body: 'Visible para el circulo familiar cuando exista acceso compartido.',
    icon: Users,
  },
  {
    id: 'selected-members',
    label: 'Personas elegidas',
    body: 'Preparada para compartir solo con familiares seleccionados.',
    icon: UserRound,
  },
];

const NARRATOR_COPY: Record<
  NarratorState,
  { eyebrow: string; title: string; body: string }
> = {
  idle: {
    eyebrow: 'Lino acompaña',
    title: 'Un lugar para cuidar historias',
    body: 'Te ayudo a empezar por una memoria simple, sin armar un árbol entero.',
  },
  prompting: {
    eyebrow: 'Lino pregunta',
    title: 'Me contás una historia?',
    body: 'Puede ser una frase, una comida, una travesura, un viaje o algo que siempre vuelve.',
  },
  listening: {
    eyebrow: 'Lino escucha',
    title: 'Escribí a tu manera',
    body: 'Podés corregir antes de guardar. La historia queda con tu voz.',
  },
  thinking: {
    eyebrow: 'Lino ordena',
    title: 'Veamos a quiénes nombra',
    body: 'Confirmá personas, agregá a quien falte y después elegimos de qué trata más.',
  },
  privacy: {
    eyebrow: 'Lino cuida',
    title: 'Antes de guardarla, elegí quién la ve',
    body: 'Algunas historias son para toda la familia; otras necesitan un círculo más chico.',
  },
  success: {
    eyebrow: 'Lino guardó',
    title: 'Ya forma parte del álbum',
    body: 'Ahora podés ver cómo se conecta o contar otra mientras la memoria está fresca.',
  },
  map: {
    eyebrow: 'Lino muestra',
    title: 'Historias conectadas por personas',
    body: 'El mapa se abre desde una persona o una historia para que no sea una nube difícil de leer.',
  },
};

const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(isoDate));

const bucketTextLength = (value: string): string => {
  const length = value.trim().length;
  if (length < 120) return 'short';
  if (length < 480) return 'medium';
  return 'long';
};

const getUniquePeople = (people: PilotPerson[]): PilotPerson[] => {
  const byId = new Map<string, PilotPerson>();
  for (const person of people) {
    byId.set(person.localId, person);
  }

  return Array.from(byId.values());
};

const createPersonId = (name: string): string =>
  `custom-${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${Date.now()}`;

const resolveSubject = (
  draft: DraftStory,
): {
  subjectType: StorySubjectType;
  primaryPersonId?: string;
  topicLabel?: string;
} => {
  if (draft.subjectType === 'topic' && draft.topicLabel.trim()) {
    return {
      subjectType: 'topic',
      topicLabel: draft.topicLabel.trim(),
    };
  }

  if (draft.subjectType === 'person' && draft.primaryPersonId) {
    return {
      subjectType: 'person',
      primaryPersonId: draft.primaryPersonId,
    };
  }

  if (draft.personIds.length === 1) {
    return {
      subjectType: 'person',
      primaryPersonId: draft.personIds[0],
    };
  }

  return {
    subjectType: 'multiple_people',
  };
};

function App() {
  const [pilotData, setPilotData] = useState<PilotData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<AppView>('landing');
  const [draft, setDraft] = useState<DraftStory>(EMPTY_DRAFT);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [localStories, setLocalStories] = useState<PilotStory[]>([]);
  const [localPeople, setLocalPeople] = useState<PilotPerson[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [draftError, setDraftError] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [lastSavedStory, setLastSavedStory] = useState<PilotStory | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextPilotData = await loadPilotData();
        if (cancelled) return;
        setPilotData(nextPilotData);
        setLocalStories(loadLocalStories());
        setLocalPeople(loadLocalPeople());
      } catch (error) {
        analytics.captureError(error, {
          screen: 'anecdotia',
          action: 'load_pilot_data',
          app: 'anecdotia',
        });
        if (!cancelled) {
          setLoadError('No pudimos cargar el anecdotario.');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const allPeople = useMemo(
    () => getUniquePeople([...(pilotData?.people || []), ...localPeople]),
    [localPeople, pilotData?.people],
  );

  const visibleStories = useMemo(() => {
    const seedStories =
      pilotData?.seedStories.filter(
        (story) => story.visibility !== 'creator-only',
      ) || [];
    return [...localStories, ...seedStories];
  }, [localStories, pilotData?.seedStories]);

  const suggestions = useMemo<PersonSuggestion[]>(
    () => findMentionedPeople(draft.text, allPeople),
    [allPeople, draft.text],
  );

  const peopleById = useMemo(() => {
    const byId = new Map<string, PilotPerson>();
    for (const person of allPeople) {
      byId.set(person.localId, person);
    }
    return byId;
  }, [allPeople]);

  const activeStory = useMemo(
    () => visibleStories.find((story) => story.id === activeStoryId) || null,
    [activeStoryId, visibleStories],
  );

  const activePerson = activePersonId ? peopleById.get(activePersonId) : null;

  const activePersonStories = useMemo(
    () =>
      activePersonId
        ? visibleStories.filter((story) => story.personIds.includes(activePersonId))
        : [],
    [activePersonId, visibleStories],
  );

  const filteredPeople = useMemo(() => {
    const search = peopleSearch.trim().toLowerCase();
    if (!search) return allPeople.slice(0, 8);

    return allPeople
      .filter((person) =>
        [person.displayName, ...person.aliases]
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
      .slice(0, 8);
  }, [allPeople, peopleSearch]);

  const selectedPeople = draft.personIds
    .map((personId) => peopleById.get(personId))
    .filter((person): person is PilotPerson => Boolean(person));

  const focusStoryInput = () => {
    textAreaRef.current?.focus();
  };

  const startCapture = (promptId?: string) => {
    setDraftError('');
    setShareStatus('');
    setSelectedPromptId(promptId || null);
    setView('capture');
    window.requestAnimationFrame(focusStoryInput);
    trackAnecdotiaEvent('story_started', {
      source: promptId ? 'post_submit_prompt' : 'family_landing',
      prompt_id: promptId,
    });
  };

  const selectPrompt = (prompt: Prompt) => {
    setSelectedPromptId(prompt.id);
    textAreaRef.current?.focus();
  };

  const startDictation = () => {
    setDraftError('');
    setShareStatus('');
    focusStoryInput();
    trackAnecdotiaEvent('story_started', {
      source: 'primary_dictation_button',
      prompt_id: selectedPromptId,
    });
  };

  const updateDraftText = (text: string) => {
    setDraft((current) => ({ ...current, text }));
    if (draftError) setDraftError('');
  };

  const reviewPeople = () => {
    if (draft.text.trim().length < 24) {
      setDraftError('Contá un poco más para guardar una historia útil.');
      return;
    }

    trackAnecdotiaEvent('transcript_completed', {
      text_length_bucket: bucketTextLength(draft.text),
    });
    trackAnecdotiaEvent('people_suggested', {
      suggestion_count: suggestions.length,
    });

    setDraft((current) => ({
      ...current,
      personIds:
        current.personIds.length > 0
          ? current.personIds
          : suggestions.map((suggestion) => suggestion.person.localId),
    }));
    setView('people');
  };

  const togglePerson = (personId: string) => {
    setDraft((current) => {
      const exists = current.personIds.includes(personId);
      return {
        ...current,
        personIds: exists
          ? current.personIds.filter((id) => id !== personId)
          : [...current.personIds, personId],
      };
    });
  };

  const addMissingPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;

    const nextPerson: PilotPerson = {
      localId: createPersonId(name),
      displayName: name,
      aliases: [],
      status: 'unknown',
    };
    const nextPeople = [...localPeople, nextPerson];
    setLocalPeople(nextPeople);
    saveLocalPeople(nextPeople);
    setNewPersonName('');
    setPeopleSearch('');
    setDraft((current) => ({
      ...current,
      personIds: [...current.personIds, nextPerson.localId],
    }));
  };

  const continueToSubject = () => {
    const selectedIds = draft.personIds;
    const nextSubjectType =
      draft.subjectType ||
      (selectedIds.length === 1 ? 'person' : 'multiple_people');
    const nextPrimaryPersonId =
      draft.primaryPersonId ||
      (selectedIds.length === 1 ? selectedIds[0] : null);

    trackAnecdotiaEvent('suggested_people_confirmed', {
      linked_people_count: draft.personIds.length,
      suggestion_count: suggestions.length,
    });

    setDraft((current) => ({
      ...current,
      subjectType: nextSubjectType,
      primaryPersonId:
        nextSubjectType === 'person' ? nextPrimaryPersonId : null,
    }));
    setView('subject');
  };

  const selectPersonSubject = (personId: string) => {
    setDraft((current) => ({
      ...current,
      subjectType: 'person',
      primaryPersonId: personId,
      topicLabel: '',
    }));
  };

  const selectMultipleSubject = () => {
    setDraft((current) => ({
      ...current,
      subjectType: 'multiple_people',
      primaryPersonId: null,
      topicLabel: '',
    }));
  };

  const updateTopicSubject = (topicLabel: string) => {
    setDraft((current) => ({
      ...current,
      subjectType: 'topic',
      primaryPersonId: null,
      topicLabel,
    }));
  };

  const continueToVisibility = () => {
    if (draft.subjectType === 'topic' && !draft.topicLabel.trim()) {
      setDraftError('Poné una palabra o frase para nombrar el tema.');
      return;
    }

    setDraftError('');
    setView('visibility');
  };

  const selectVisibility = (visibility: VisibilityMode) => {
    setDraft((current) => ({ ...current, visibility }));
    trackAnecdotiaEvent('visibility_selected', {
      visibility,
    });
  };

  const toggleSensitiveMemory = () => {
    setDraft((current) => {
      const isSensitive = !current.isSensitive;
      return {
        ...current,
        isSensitive,
        visibility:
          isSensitive &&
          (!current.visibility || current.visibility === 'family-circle')
            ? 'selected-members'
            : current.visibility,
      };
    });
  };

  const saveDraft = () => {
    if (!draft.visibility) {
      setDraftError('Elegí quién puede ver esta historia antes de guardarla.');
      return;
    }

    const subject = resolveSubject(draft);
    const story = saveLocalStory({
      isSensitive: draft.isSensitive,
      primaryPersonId: subject.primaryPersonId,
      subjectType: subject.subjectType,
      text: draft.text,
      topicLabel: subject.topicLabel,
      personIds: draft.personIds,
      visibility: draft.visibility,
    });
    setLocalStories((current) => [story, ...current]);
    setLastSavedStory(story);
    setDraft(EMPTY_DRAFT);
    setSelectedPromptId(null);
    setDraftError('');
    setShareStatus('');
    setView('saved');

    trackAnecdotiaEvent('story_saved', {
      is_sensitive: story.isSensitive,
      subject_type: story.subjectType,
      visibility: story.visibility,
      linked_people_count: story.personIds.length,
      text_length_bucket: bucketTextLength(story.text),
    });

    if (story.personIds.length > 0) {
      trackAnecdotiaEvent('person_linked', {
        linked_people_count: story.personIds.length,
      });
    }
  };

  const openStory = (storyId: string) => {
    setActiveStoryId(storyId);
    setView('story');
    trackAnecdotiaEvent('existing_anecdote_opened', {
      source: visibleStories.find((story) => story.id === storyId)?.source || 'unknown',
    });
  };

  const openPerson = (personId: string) => {
    setActivePersonId(personId);
    setView('person');
  };

  const shareLastSavedStory = async () => {
    if (!lastSavedStory) return;

    const linkedNames = lastSavedStory.personIds
      .map((personId) => peopleById.get(personId)?.displayName)
      .filter(Boolean)
      .join(', ');
    const shareText = [
      lastSavedStory.title,
      '',
      lastSavedStory.text,
      linkedNames ? `Personas: ${linkedNames}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: lastSavedStory.title,
          text: shareText,
        });
        setShareStatus('Listo, se abrió el compartir del dispositivo.');
        return;
      }

      if (!navigator.clipboard?.writeText) {
        setShareStatus('Copiá el texto desde la historia guardada.');
        return;
      }

      await navigator.clipboard.writeText(shareText);
      setShareStatus('Copiada para enviar.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      analytics.captureError(error, {
        screen: 'saved_story',
        action: 'share_story',
        app: 'anecdotia',
      });
      setShareStatus('No se pudo compartir. Probá copiarla manualmente.');
    }
  };

  const handleLandingPrimaryAction = () => {
    if (draft.text.trim().length > 0) {
      reviewPeople();
      return;
    }

    focusStoryInput();
  };

  if (!pilotData && !loadError) {
    return (
      <main className="anecdotia-app">
        <section className="loading-shell" aria-busy="true">
          <div className="loading-mark" />
          <div>
            <p className="eyebrow">Anecdotia</p>
            <h1>Cargando anecdotario</h1>
          </div>
        </section>
      </main>
    );
  }

  if (loadError || !pilotData) {
    return (
      <main className="anecdotia-app">
        <section className="error-shell" role="alert">
          <BookOpen aria-hidden="true" />
          <h1>{loadError || 'No pudimos abrir Anecdotia.'}</h1>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={view === 'landing' ? 'anecdotia-app landing-app' : 'anecdotia-app'}>
      {view !== 'landing' && (
        <header className="app-topbar">
          <button
            aria-label="Volver al inicio"
            className="brand-button"
            type="button"
            onClick={() => setView('landing')}
          >
            <BookOpen aria-hidden="true" />
            <span>Anecdotia</span>
          </button>
          <div className="topbar-meta">
            <span>{pilotData.circle.displayName}</span>
            <span>{visibleStories.length} historias</span>
          </div>
        </header>
      )}

      {view === 'landing' && (
        <LandingExperience
          circle={pilotData.circle}
          draft={draft}
          draftError={draftError}
          people={allPeople}
          selectedPromptId={selectedPromptId}
          textAreaRef={textAreaRef}
          onFocusStoryInput={focusStoryInput}
          onOpenLibrary={() => setView('library')}
          onOpenPerson={openPerson}
          onPrimaryAction={handleLandingPrimaryAction}
          onStartCapture={startCapture}
          onStartDictation={startDictation}
          onUpdateDraftText={updateDraftText}
        />
      )}

      {view === 'capture' && (
        <section className="capture-grid guided-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('landing')}>
              <ArrowLeft aria-hidden="true" />
              Inicio
            </button>
            <span>Escribir o dictar</span>
          </div>

          <NarratorStage state={draft.text.trim().length > 0 ? 'listening' : 'prompting'} compact />

          <div className="capture-panel">
            <p className="eyebrow">Recuerdo</p>
            <h1>Contá algo simple, con tus palabras</h1>
            <div className="prompt-row" aria-label="Disparadores de recuerdo">
              {PROMPTS.map((prompt) => (
                <button
                  className={selectedPromptId === prompt.id ? 'prompt-chip active' : 'prompt-chip'}
                  key={prompt.id}
                  type="button"
                  onClick={() => selectPrompt(prompt)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
            <textarea
              aria-describedby={draftError ? 'draft-error' : 'draft-hint'}
              aria-invalid={Boolean(draftError)}
              aria-label="Texto de la anécdota"
              autoComplete="off"
              className="story-textarea"
              name="story-text"
              onChange={(event) => updateDraftText(event.target.value)}
              placeholder={
                selectedPromptId
                  ? PROMPTS.find((prompt) => prompt.id === selectedPromptId)?.body
                  : 'Escribí o usá el dictado del celular…'
              }
              ref={textAreaRef}
              value={draft.text}
            />
            <div className="textarea-footer">
              <span aria-live="polite" id={draftError ? 'draft-error' : 'draft-hint'}>{draftError || 'Podés corregirla antes de guardarla.'}</span>
              <span>{draft.text.trim().length} caracteres</span>
            </div>
            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={startDictation}>
                <Mic2 aria-hidden="true" />
                Dictado del celular
              </button>
              <button className="primary-button" type="button" onClick={reviewPeople}>
                Revisar personas
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'people' && (
        <section className="people-grid guided-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('capture')}>
              <ArrowLeft aria-hidden="true" />
              Texto
            </button>
            <span>Personas</span>
          </div>

          <NarratorStage state="thinking" compact />

          <div className="people-panel">
            <div className="panel-heading">
              <p className="eyebrow">Personas mencionadas</p>
              <h1>Confirmá a quiénes vincular</h1>
            </div>

            <div className="suggestion-list">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion) => (
                  <PersonToggle
                    key={suggestion.person.localId}
                    checked={draft.personIds.includes(suggestion.person.localId)}
                    person={suggestion.person}
                    detail={suggestion.matchReason}
                    onToggle={() => togglePerson(suggestion.person.localId)}
                  />
                ))
              ) : (
                <div className="inline-empty">
                  <Search aria-hidden="true" />
                  <span>No encontramos nombres del roster en el texto.</span>
                </div>
              )}
            </div>

            <div className="people-search">
              <label htmlFor="people-search">Buscar en el roster</label>
              <div className="search-input">
                <Search aria-hidden="true" />
                <input
                  autoComplete="off"
                  id="people-search"
                  name="people-search"
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  placeholder="Nombre o apodo…"
                  type="search"
                  value={peopleSearch}
                />
              </div>
              {peopleSearch && (
                <div className="compact-list">
                  {filteredPeople.map((person) => (
                    <PersonToggle
                      compact
                      key={person.localId}
                      checked={draft.personIds.includes(person.localId)}
                      person={person}
                      onToggle={() => togglePerson(person.localId)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="add-person">
              <label htmlFor="new-person">Agregar alguien que falta</label>
              <div className="add-person-row">
                <input
                  autoComplete="off"
                  id="new-person"
                  name="new-person"
                  onChange={(event) => setNewPersonName(event.target.value)}
                  placeholder="Nombre de la persona…"
                  value={newPersonName}
                />
                <button className="icon-button" type="button" onClick={addMissingPerson} aria-label="Agregar persona">
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </div>

            {selectedPeople.length > 0 && (
              <div className="selected-people" aria-label="Personas vinculadas">
                {selectedPeople.map((person) => (
                  <button
                    className="person-pill selected"
                    key={person.localId}
                    type="button"
                    onClick={() => togglePerson(person.localId)}
                  >
                    <Check aria-hidden="true" />
                    {person.displayName}
                  </button>
                ))}
              </div>
            )}

            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={() => setView('capture')}>
                Corregir texto
              </button>
              <button className="primary-button" type="button" onClick={continueToSubject}>
                De qué trata
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'subject' && (
        <section className="subject-grid guided-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('people')}>
              <ArrowLeft aria-hidden="true" />
              Personas
            </button>
            <span>Tema principal</span>
          </div>

          <NarratorStage state="thinking" compact />

          <div className="subject-panel">
            <p className="eyebrow">Tema principal</p>
            <h1>De qué trata más esta historia?</h1>
            <p className="panel-lead">
              Las personas nombradas quedan vinculadas igual. Esto solo ayuda a
              ubicar la historia en el álbum.
            </p>

            <div className="subject-options" aria-label="Tema principal de la historia">
              {selectedPeople.map((person) => (
                <button
                  className={
                    draft.subjectType === 'person' &&
                    draft.primaryPersonId === person.localId
                      ? 'subject-option selected'
                      : 'subject-option'
                  }
                  key={person.localId}
                  type="button"
                  onClick={() => selectPersonSubject(person.localId)}
                >
                  <span className="person-avatar" aria-hidden="true">
                    {person.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>Es principalmente sobre esta persona</small>
                  </span>
                  {draft.subjectType === 'person' &&
                    draft.primaryPersonId === person.localId && <Check aria-hidden="true" />}
                </button>
              ))}

              {selectedPeople.length > 1 && (
                <button
                  className={
                    draft.subjectType === 'multiple_people'
                      ? 'subject-option selected'
                      : 'subject-option'
                  }
                  type="button"
                  onClick={selectMultipleSubject}
                >
                  <Users aria-hidden="true" />
                  <span>
                    <strong>Varias personas</strong>
                    <small>La historia vive entre quienes nombraste</small>
                  </span>
                  {draft.subjectType === 'multiple_people' && <Check aria-hidden="true" />}
                </button>
              )}

              <label
                className={
                  draft.subjectType === 'topic'
                    ? 'subject-option topic-option selected'
                    : 'subject-option topic-option'
                }
              >
                <Tag aria-hidden="true" />
                <span>
                  <strong>Un tema, lugar o costumbre</strong>
                  <small>Ej: la casa de la abuela, los ñoquis, un viaje</small>
                </span>
                <input
                  autoComplete="off"
                  name="topic-label"
                  onChange={(event) => updateTopicSubject(event.target.value)}
                  onFocus={() => updateTopicSubject(draft.topicLabel)}
                  placeholder="Nombralo en pocas palabras"
                  value={draft.topicLabel}
                />
              </label>
            </div>

            {draftError && <p className="field-error" aria-live="polite">{draftError}</p>}

            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={() => setView('people')}>
                Volver
              </button>
              <button className="primary-button" type="button" onClick={continueToVisibility}>
                Elegir privacidad
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'visibility' && (
        <section className="visibility-grid guided-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('subject')}>
              <ArrowLeft aria-hidden="true" />
              Tema
            </button>
            <span>Privacidad</span>
          </div>

          <NarratorStage state="privacy" compact />

          <div className="visibility-panel">
            <p className="eyebrow">Privacidad</p>
            <h1>Elegí quién puede verla</h1>
            <button
              className={
                draft.isSensitive
                  ? 'sensitive-toggle selected'
                  : 'sensitive-toggle'
              }
              type="button"
              onClick={toggleSensitiveMemory}
            >
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Este recuerdo es sensible</strong>
                <small>
                  Si lo marcás, Lino te sugiere guardarlo para un círculo más
                  chico.
                </small>
              </span>
              {draft.isSensitive && <Check aria-hidden="true" />}
            </button>
            <fieldset className="visibility-options">
              <legend>Visibilidad de la anécdota</legend>
              {VISIBILITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    className={
                      draft.visibility === option.id
                        ? 'visibility-option selected'
                        : 'visibility-option'
                    }
                    key={option.id}
                    type="button"
                    onClick={() => selectVisibility(option.id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.body}</small>
                    </span>
                    {draft.visibility === option.id && <Check aria-hidden="true" />}
                  </button>
                );
              })}
            </fieldset>
            {draftError && <p className="field-error" aria-live="polite">{draftError}</p>}
            <div className="panel-actions">
              <button className="secondary-button" type="button" onClick={() => setView('subject')}>
                Volver
              </button>
              <button className="primary-button" type="button" onClick={saveDraft}>
                Guardar anécdota
                <Check aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'saved' && lastSavedStory && (
        <section className="saved-grid guided-grid">
          <NarratorStage state="success" compact />
          <div className="success-panel">
            <div className="success-mark">
              <Check aria-hidden="true" />
            </div>
            <p className="eyebrow">Guardada</p>
            <h1>{lastSavedStory.title}</h1>
            <p>{lastSavedStory.text}</p>
            <ConnectionReveal peopleById={peopleById} story={lastSavedStory} />
            <div className="selected-people">
              {lastSavedStory.personIds.map((personId) => {
                const person = peopleById.get(personId);
                if (!person) return null;
                return (
                  <button
                    className="person-pill"
                    key={personId}
                    type="button"
                    onClick={() => openPerson(personId)}
                  >
                    <UserRound aria-hidden="true" />
                    {person.displayName}
                  </button>
                );
              })}
            </div>
            {shareStatus && <p className="share-status">{shareStatus}</p>}
            {visibleStories.length <= 1 && (
              <div className="next-prompts" aria-label="Siguientes recuerdos">
                {PROMPTS.map((prompt) => (
                  <button
                    className="prompt-chip"
                    key={prompt.id}
                    type="button"
                    onClick={() => startCapture(prompt.id)}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            )}
            <div className="saved-actions">
              <button className="secondary-button" type="button" onClick={() => setView('library')}>
                <Archive aria-hidden="true" />
                Ver álbum familiar
              </button>
              <button className="secondary-button" type="button" onClick={shareLastSavedStory}>
                <Share2 aria-hidden="true" />
                Compartir borrador
              </button>
              <button className="primary-button" type="button" onClick={() => startCapture()}>
                <Plus aria-hidden="true" />
                Contar otra
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'library' && (
        <StoryLibrary
          peopleById={peopleById}
          stories={visibleStories}
          onBack={() => setView('landing')}
          onOpenPerson={openPerson}
          onOpenStory={openStory}
          onStartCapture={startCapture}
        />
      )}

      {view === 'story' && activeStory && (
        <StoryDetail
          peopleById={peopleById}
          story={activeStory}
          onBack={() => setView('library')}
          onOpenPerson={openPerson}
          onStartCapture={startCapture}
        />
      )}

      {view === 'person' && activePerson && (
        <PersonMemoryView
          person={activePerson}
          stories={activePersonStories}
          onBack={() => setView('library')}
          onOpenStory={openStory}
          onStartCapture={startCapture}
        />
      )}
    </main>
  );
}

function LandingExperience({
  circle,
  draft,
  draftError,
  onFocusStoryInput,
  onOpenLibrary,
  onOpenPerson,
  onPrimaryAction,
  onStartCapture,
  onStartDictation,
  onUpdateDraftText,
  people,
  selectedPromptId,
  textAreaRef,
}: {
  circle: PilotCircle;
  draft: DraftStory;
  draftError: string;
  onFocusStoryInput: () => void;
  onOpenLibrary: () => void;
  onOpenPerson: (personId: string) => void;
  onPrimaryAction: () => void;
  onStartCapture: (promptId?: string) => void;
  onStartDictation: () => void;
  onUpdateDraftText: (text: string) => void;
  people: PilotPerson[];
  selectedPromptId: string | null;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const selectedPrompt = selectedPromptId
    ? PROMPTS.find((prompt) => prompt.id === selectedPromptId)
    : null;
  const mapPeople = people.slice(0, 4);

  return (
    <section className="mockup-home" aria-label={circle.landingTitle}>
      <nav className="mockup-nav" aria-label="Navegación principal">
        <button
          className="round-nav-button"
          type="button"
          onClick={onOpenLibrary}
          aria-label="Abrir álbum familiar"
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="landing-brand-lockup">
          <span>Anecdotia</span>
          <small>{circle.displayName}</small>
        </div>
        <button
          className="round-nav-button"
          type="button"
          onClick={onOpenLibrary}
          aria-label="Ver personas e historias"
        >
          <Users aria-hidden="true" />
        </button>
      </nav>

      <div className="mockup-hero-scene">
        <img
          alt=""
          aria-hidden="true"
          className="landing-hero-scene-image"
          src={landingCollageBoard}
        />
      </div>

      <section className="mockup-compose" aria-label="Contar una anécdota">
        <div className="mockup-title-block">
          <h1>¿Cuál es la próxima historia?</h1>
          <p>Puede ser graciosa, rara, tierna o épica</p>
          <div className="mockup-privacy-line">
            <Lock aria-hidden="true" />
            <span>Privado para tu familia. Vos elegís quién la ve.</span>
          </div>
        </div>

        <div className="mockup-input-shell">
          <textarea
            aria-describedby={draftError ? 'landing-draft-error' : 'landing-draft-hint'}
            aria-invalid={Boolean(draftError)}
            aria-label="Escribí o dictá una anécdota"
            autoComplete="off"
            id="landing-story-text"
            name="landing-story-text"
            onChange={(event) => onUpdateDraftText(event.target.value)}
            placeholder={
              selectedPrompt
                ? selectedPrompt.body
                : 'Contala acá'
            }
            ref={textAreaRef}
            rows={1}
            value={draft.text}
          />
          <button className="input-mic-button" type="button" onClick={onStartDictation} aria-label="Usar dictado del celular">
            <Mic2 aria-hidden="true" />
          </button>
        </div>

        <div className="mockup-mode-row" aria-label="Modo de captura">
          <button className="mode-button write-mode" type="button" onClick={onFocusStoryInput}>
            <PenLine aria-hidden="true" />
            Escribir
          </button>
          <button className="mode-button speak-mode" type="button" onClick={onStartDictation}>
            <Mic2 aria-hidden="true" />
            Hablar
          </button>
        </div>

        <button className="save-memory-button" type="button" onClick={onPrimaryAction}>
          <Sparkles aria-hidden="true" />
          Preparar historia
        </button>

        <div className="textarea-footer mockup-footer">
          <span aria-live="polite" id={draftError ? 'landing-draft-error' : 'landing-draft-hint'}>
            {draftError || 'Después confirmamos personas y privacidad antes de guardarla.'}
          </span>
          <span>{draft.text.trim().length} caracteres</span>
        </div>
      </section>

      <aside className="mockup-people-map" aria-label="Tu mapa de personas">
        <img
          alt=""
          aria-hidden="true"
          className="landing-people-strip-image"
          src={landingPeopleCard}
        />
        <div className="people-strip-hotspots" aria-label="Personas del mapa">
          {mapPeople.map((person, index) => (
            <button
              className={`people-strip-hotspot person-${index + 1}`}
              key={person.localId}
              type="button"
              onClick={() => onOpenPerson(person.localId)}
              aria-label={`Ver recuerdos de ${person.displayName}`}
            />
          ))}
          <button
            className="people-strip-hotspot add"
            type="button"
            onClick={() => onStartCapture('person-memory')}
            aria-label="Agregar persona o recuerdo"
          />
        </div>
      </aside>
    </section>
  );
}

function NarratorStage({
  compact = false,
  state,
}: {
  compact?: boolean;
  state: NarratorState;
}) {
  const copy = NARRATOR_COPY[state];

  return (
    <aside
      className={compact ? 'narrator-stage compact' : 'narrator-stage'}
      data-rive-state={state}
      aria-label={`${copy.eyebrow}: ${copy.title}`}
    >
      <div className="lino-figure" aria-hidden="true">
        <div className="lino-head">
          <span className="lino-eye left" />
          <span className="lino-eye right" />
          <span className="lino-mouth" />
        </div>
        <div className="lino-body">
          <span className="lino-scarf" />
          <span className="lino-notebook" />
        </div>
      </div>
      <div className="narrator-copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
    </aside>
  );
}

function ConnectionReveal({
  peopleById,
  story,
}: {
  peopleById: Map<string, PilotPerson>;
  story: PilotStory;
}) {
  const primaryPerson = story.primaryPersonId
    ? peopleById.get(story.primaryPersonId)
    : null;
  const mentionedPeople = story.personIds
    .map((personId) => peopleById.get(personId))
    .filter((person): person is PilotPerson => Boolean(person));

  const subjectLabel =
    story.subjectType === 'topic'
      ? story.topicLabel || 'Tema familiar'
      : story.subjectType === 'person' && primaryPerson
        ? primaryPerson.displayName
        : story.subjectType === 'multiple_people'
          ? 'Varias personas'
          : 'Historia familiar';

  return (
    <div className="connection-reveal" aria-label="Conexión de la historia">
      <div className="connection-card primary">
        {story.subjectType === 'topic' ? (
          <Tag aria-hidden="true" />
        ) : (
          <HeartHandshake aria-hidden="true" />
        )}
        <span>
          <strong>{subjectLabel}</strong>
          <small>tema principal</small>
        </span>
      </div>
      {mentionedPeople.length > 0 && (
        <div className="connection-thread">
          <GitBranch aria-hidden="true" />
          <span>
            Vinculada con{' '}
            {mentionedPeople.map((person) => person.displayName).join(', ')}
          </span>
        </div>
      )}
      {story.isSensitive && (
        <div className="connection-thread sensitive">
          <ShieldCheck aria-hidden="true" />
          <span>Marcada como recuerdo sensible</span>
        </div>
      )}
    </div>
  );
}

function PersonToggle({
  checked,
  compact = false,
  detail,
  onToggle,
  person,
}: {
  checked: boolean;
  compact?: boolean;
  detail?: string;
  onToggle: () => void;
  person: PilotPerson;
}) {
  return (
    <button
      className={`${compact ? 'person-toggle compact' : 'person-toggle'}${checked ? ' checked' : ''}`}
      type="button"
      onClick={onToggle}
    >
      <span className="person-avatar" aria-hidden="true">
        {person.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <strong>{person.displayName}</strong>
        {detail || person.relationshipHint ? (
          <small>{detail || person.relationshipHint}</small>
        ) : null}
      </span>
      {checked && <Check aria-hidden="true" />}
    </button>
  );
}

function StoryLibrary({
  onBack,
  onOpenPerson,
  onOpenStory,
  onStartCapture,
  peopleById,
  stories,
}: {
  onBack: () => void;
  onOpenPerson: (personId: string) => void;
  onOpenStory: (storyId: string) => void;
  onStartCapture: () => void;
  peopleById: Map<string, PilotPerson>;
  stories: PilotStory[];
}) {
  return (
    <section className="library-grid">
      <div className="flow-header">
        <button className="ghost-button" type="button" onClick={onBack}>
          <Home aria-hidden="true" />
          Inicio
        </button>
        <button className="primary-button compact-action" type="button" onClick={onStartCapture}>
          <Plus aria-hidden="true" />
          Contar
        </button>
      </div>
      <div className="library-list">
        <p className="eyebrow">Historias visibles</p>
        <h1>Anécdotas de la familia</h1>
        {stories.map((story) => (
          <article className="story-row" key={story.id}>
            <button className="story-row-main" type="button" onClick={() => onOpenStory(story.id)}>
              <span>{formatDate(story.createdAt)}</span>
              <strong>{story.title}</strong>
              <small>{story.text}</small>
            </button>
            <div className="story-row-people">
              {story.personIds.slice(0, 3).map((personId) => {
                const person = peopleById.get(personId);
                if (!person) return null;
                return (
                  <button
                    className="person-pill"
                    key={personId}
                    type="button"
                    onClick={() => onOpenPerson(personId)}
                  >
                    {person.displayName}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoryDetail({
  onBack,
  onOpenPerson,
  onStartCapture,
  peopleById,
  story,
}: {
  onBack: () => void;
  onOpenPerson: (personId: string) => void;
  onStartCapture: () => void;
  peopleById: Map<string, PilotPerson>;
  story: PilotStory;
}) {
  return (
    <section className="detail-grid">
      <div className="flow-header">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Anécdotas
        </button>
        <button className="secondary-button compact-action" type="button" onClick={onStartCapture}>
          <PenLine aria-hidden="true" />
          Otra
        </button>
      </div>
      <article className="story-detail">
        <span className="story-card-date">{formatDate(story.createdAt)}</span>
        <h1>{story.title}</h1>
        <p>{story.text}</p>
        <div className="detail-meta">
          <span>
            <Clipboard aria-hidden="true" />
            {story.sourceLabel}
          </span>
          <span>
            <MessageCircle aria-hidden="true" />
            {story.responseCount} aportes
          </span>
        </div>
        <div className="selected-people">
          {story.personIds.map((personId) => {
            const person = peopleById.get(personId);
            if (!person) return null;
            return (
              <button
                className="person-pill"
                key={personId}
                type="button"
                onClick={() => onOpenPerson(personId)}
              >
                <UserRound aria-hidden="true" />
                {person.displayName}
              </button>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function PersonMemoryView({
  onBack,
  onOpenStory,
  onStartCapture,
  person,
  stories,
}: {
  onBack: () => void;
  onOpenStory: (storyId: string) => void;
  onStartCapture: () => void;
  person: PilotPerson;
  stories: PilotStory[];
}) {
  return (
    <section className="person-grid">
      <div className="flow-header">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Anécdotas
        </button>
        <button className="secondary-button compact-action" type="button" onClick={onStartCapture}>
          <PenLine aria-hidden="true" />
          Nueva
        </button>
      </div>
      <div className="person-memory">
        <div className="person-title">
          <span className="person-avatar large" aria-hidden="true">
            {person.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="eyebrow">Recuerdos vinculados</p>
            <h1>{person.displayName}</h1>
          </div>
        </div>
        {stories.length > 0 ? (
          <div className="memory-list">
            {stories.map((story) => (
              <button
                className="story-card"
                key={story.id}
                type="button"
                onClick={() => onOpenStory(story.id)}
              >
                <span className="story-card-date">{formatDate(story.createdAt)}</span>
                <strong>{story.title}</strong>
                <span>{story.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <h2>No hay historias visibles para esta persona</h2>
            <button className="primary-button" type="button" onClick={onStartCapture}>
              <Plus aria-hidden="true" />
              Agregar recuerdo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
