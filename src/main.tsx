import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { analytics, initAnalytics, trackAnecdotiaEvent } from './services/analytics';

initAnalytics();
analytics.track('app_opened');
trackAnecdotiaEvent('family_landing_viewed', {
  route: window.location.pathname,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
