import React from 'react';
import { createRoot } from 'react-dom/client';
import TripApp from './trip-app';
import './globals.css';
import './sheets.css';
import './weather.css';
createRoot(document.getElementById('root')!).render(<TripApp />);
