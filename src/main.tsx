import '@fontsource/cinzel/latin-600.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { NotFound } from './components/ui.tsx';
import { DataProvider } from './data.tsx';
import { CircuitCompare, CircuitDetail, CircuitsIndex } from './pages/Circuits.tsx';
import { Home } from './pages/Home.tsx';
import { Methods } from './pages/Methods.tsx';
import { Records } from './pages/Records.tsx';
import { EveningDetail, Restaurants } from './pages/Restaurants.tsx';
import { Trends } from './pages/Trends.tsx';
import { HeadToHead, WizardProfile, WizardsIndex } from './pages/Wizards.tsx';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="circuits" element={<CircuitsIndex />} />
            <Route path="circuits/compare" element={<CircuitCompare />} />
            <Route path="circuits/:n" element={<CircuitDetail />} />
            <Route path="restaurants" element={<Restaurants />} />
            <Route path="evenings/:id" element={<EveningDetail />} />
            <Route path="wizards" element={<WizardsIndex />} />
            <Route path="wizards/head-to-head" element={<HeadToHead />} />
            <Route path="wizards/:name" element={<WizardProfile />} />
            <Route path="trends" element={<Trends />} />
            <Route path="records" element={<Records />} />
            <Route path="methods" element={<Methods />} />
            <Route path="*" element={<NotFound what="page" />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>,
);
