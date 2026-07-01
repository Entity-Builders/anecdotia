import { Analytics, PostHogProvider } from '@eb-packages/analytics';

type AnecdotiaEvent =
  | 'family_landing_viewed'
  | 'story_started'
  | 'transcript_completed'
  | 'people_suggested'
  | 'suggested_people_confirmed'
  | 'story_saved'
  | 'person_linked'
  | 'visibility_selected'
  | 'existing_anecdote_opened'
  | 'response_added';

export const analytics = new Analytics(new PostHogProvider());

export const initAnalytics = (): void => {
  analytics.init({
    apiKey: import.meta.env.VITE_POSTHOG_KEY || '',
    apiHost: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    disabled: import.meta.env.DEV || !import.meta.env.VITE_POSTHOG_KEY,
    disableSessionRecording: true,
    autocapture: false,
  });
  analytics.setGlobalProperties({
    app: 'anecdotia',
    pilot_mode: import.meta.env.VITE_ANECDOTIA_PILOT_MODE || 'mini_pwa',
  });
};

export const trackAnecdotiaEvent = (
  event: AnecdotiaEvent,
  properties: Record<string, unknown> = {},
): void => {
  analytics.track(event, {
    app: 'anecdotia',
    ...properties,
  });
};
