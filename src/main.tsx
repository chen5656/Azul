import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { AuthProvider } from './auth';
import { GameStyleProvider } from './context/GameStyleContext';
import { RouterProvider } from './router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <GameStyleProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </GameStyleProvider>
    </AuthProvider>
  </StrictMode>,
);
