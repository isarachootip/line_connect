import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// จุดเริ่มต้นการเรนเดอร์แอปพลิเคชัน Admin Backoffice
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
