import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { InactivityProvider } from './components/InactivityProvider';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InactivityProvider>
          <RouterProvider router={router} />
        </InactivityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
