import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary variant="page" label="StoryMotion Studio">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
