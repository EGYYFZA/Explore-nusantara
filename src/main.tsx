import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import FilterPage from './FilterPage';
import { regionsLoader } from './loaders';
import RegionError from './RegionError';
import './index.css';

const router = createBrowserRouter([
  {
    path: "/",
    element: <FilterPage />,
    loader: regionsLoader,
    shouldRevalidate: () => false,
    errorElement: <RegionError />,
    hydrateFallbackElement: <main className="route-error" role="status">Memuat wilayah…</main>,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
