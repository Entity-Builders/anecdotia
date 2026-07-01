import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clipboard,
  Home,
  Lock,
  MessageCircle,
  Mic2,
  PenLine,
  Plus,
  Search,
  Share2,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  PersonSuggestion,
  PilotData,
  PilotPerson,
  PilotStory,
  VisibilityMode,
} from './domain/types';
import { analytics, trackAnecdotiaEvent } from './services/analytics';

type AppView =
  | 'landing'
  | 'capture'
  | 'people'
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

const EMPTY_DRAFT: DraftStory = {
  text: '',
  personIds: [],
  visibility: null,
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
    setView('landing');
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

  const continueToVisibility = () => {
    trackAnecdotiaEvent('suggested_people_confirmed', {
      linked_people_count: draft.personIds.length,
      suggestion_count: suggestions.length,
    });
    setView('visibility');
  };

  const selectVisibility = (visibility: VisibilityMode) => {
    setDraft((current) => ({ ...current, visibility }));
    trackAnecdotiaEvent('visibility_selected', {
      visibility,
    });
  };

  const saveQuickDraft = () => {
    if (draft.text.trim().length < 24) {
      setDraftError('Contá un poco más para guardar una historia útil.');
      focusStoryInput();
      return;
    }

    const linkedPersonIds =
      draft.personIds.length > 0
        ? draft.personIds
        : suggestions.map((suggestion) => suggestion.person.localId);
    const visibility = draft.visibility || 'family-circle';
    const story = saveLocalStory({
      text: draft.text,
      personIds: linkedPersonIds,
      visibility,
    });

    setLocalStories((current) => [story, ...current]);
    setLastSavedStory(story);
    setDraft(EMPTY_DRAFT);
    setSelectedPromptId(null);
    setDraftError('');
    setShareStatus('');
    setView('saved');

    trackAnecdotiaEvent('story_saved', {
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

  const saveDraft = () => {
    if (!draft.visibility) {
      setDraftError('Elegí quién puede ver esta historia antes de guardarla.');
      return;
    }

    const story = saveLocalStory({
      text: draft.text,
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
    <main className="anecdotia-app">
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

      {view === 'landing' && (
        <section className="landing-grid compact-flow">
          <div className="story-entry-panel">
            <div className="landing-copy">
              <p className="eyebrow">Anecdotia</p>
              <h1>Contá algo que no se debería perder.</h1>
              <p className="lead">
                Puede ser una frase, una comida, una travesura o una historia que siempre vuelve.
              </p>
            </div>

            <div className="prompt-row" aria-label="Ideas para empezar">
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
              aria-label="Contar una anécdota"
              autoComplete="off"
              className="story-textarea landing-textarea"
              name="story-text"
              onChange={(event) => updateDraftText(event.target.value)}
              placeholder={
                selectedPromptId
                  ? PROMPTS.find((prompt) => prompt.id === selectedPromptId)?.body
                  : 'Tocá acá y escribí o dictá con el micrófono del teclado…'
              }
              ref={textAreaRef}
              value={draft.text}
            />

            <div className="entry-actions">
              <button className="primary-button talk-button" type="button" onClick={startDictation}>
                <Mic2 aria-hidden="true" />
                Hablar o escribir
              </button>
              <button className="secondary-button" type="button" onClick={saveQuickDraft}>
                <Check aria-hidden="true" />
                Guardar
              </button>
            </div>

            <div className="textarea-footer">
              <span aria-live="polite" id={draftError ? 'draft-error' : 'draft-hint'}>
                {draftError || 'El botón abre el teclado; después tocá el micrófono del celular si preferís dictar.'}
              </span>
              <span>{draft.text.trim().length} caracteres</span>
            </div>

            <div className="quick-visibility" aria-label="Privacidad">
              {VISIBILITY_OPTIONS.slice(0, 2).map((option) => (
                <button
                  className={
                    (draft.visibility || 'family-circle') === option.id
                      ? 'prompt-chip active'
                      : 'prompt-chip'
                  }
                  key={option.id}
                  type="button"
                  onClick={() => selectVisibility(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {(suggestions.length > 0 || selectedPeople.length > 0) && (
              <div className="suggested-people" aria-label="Personas detectadas">
                <p className="section-label">Personas</p>
                <div className="selected-people">
                  {(selectedPeople.length > 0
                    ? selectedPeople
                    : suggestions.map((suggestion) => suggestion.person)
                  ).map((person) => (
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
              </div>
            )}
          </div>

          <div className="memory-strip" aria-label="Historias recientes">
            <div className="section-row">
              <p className="section-label">Para inspirarse</p>
              {visibleStories.length > 0 && (
                <button className="ghost-button compact-action" type="button" onClick={() => setView('library')}>
                  Ver todas
                </button>
              )}
            </div>
            {visibleStories.slice(0, 2).map((story) => (
              <button
                className="story-card"
                key={story.id}
                type="button"
                onClick={() => openStory(story.id)}
              >
                <span className="story-card-date">{formatDate(story.createdAt)}</span>
                <strong>{story.title}</strong>
                <span>{story.text}</span>
              </button>
            ))}
            {visibleStories.length === 0 && (
              <div className="empty-state">
                <BookOpen aria-hidden="true" />
                <h2>Podés empezar con algo corto</h2>
                <p>Una frase familiar alcanza.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {view === 'capture' && (
        <section className="capture-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('landing')}>
              <ArrowLeft aria-hidden="true" />
              Inicio
            </button>
            <span>Escribir o dictar</span>
          </div>

          <div className="capture-panel">
            <p className="eyebrow">Recuerdo</p>
            <h1>Contá algo simple</h1>
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
              <span className="dictation-note">
                <Mic2 aria-hidden="true" />
                Dictado del celular
              </span>
              <button className="primary-button" type="button" onClick={reviewPeople}>
                Revisar personas
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'people' && (
        <section className="people-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('capture')}>
              <ArrowLeft aria-hidden="true" />
              Texto
            </button>
            <span>Personas</span>
          </div>

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
              <button className="primary-button" type="button" onClick={continueToVisibility}>
                Elegir privacidad
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'visibility' && (
        <section className="visibility-grid">
          <div className="flow-header">
            <button className="ghost-button" type="button" onClick={() => setView('people')}>
              <ArrowLeft aria-hidden="true" />
              Personas
            </button>
            <span>Privacidad</span>
          </div>

          <div className="visibility-panel">
            <p className="eyebrow">Privacidad</p>
            <h1>Elegí quién puede verla</h1>
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
              <button className="secondary-button" type="button" onClick={() => setView('people')}>
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
        <section className="saved-grid">
          <div className="success-panel">
            <div className="success-mark">
              <Check aria-hidden="true" />
            </div>
            <p className="eyebrow">Guardada</p>
            <h1>{lastSavedStory.title}</h1>
            <p>{lastSavedStory.text}</p>
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
              {visibleStories.length > 1 && (
                <button className="secondary-button" type="button" onClick={() => setView('library')}>
                  <BookOpen aria-hidden="true" />
                  Ver anécdotas
                </button>
              )}
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
