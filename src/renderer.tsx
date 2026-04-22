import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { HashRouter, Routes } from "react-router-dom";
import { renderRoutes } from "./routes";
import { LoadingScreen } from "./components/common/LoadingScreen";
import './index.css';

import { ThemeProvider } from "./hooks/theme-provider";
import { useHardwareStore } from "./stores/HardwareStore";

const App = () => {
  const [isReady, setIsReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { fetchHardwareInfo } = useHardwareStore();

  useEffect(() => {
    console.log("[Renderer] Starting initialization...");
    fetchHardwareInfo();

    // Create a timeout to ensure we don't stay on a blank screen forever
    const timeoutId = setTimeout(() => {
      console.warn("[Renderer] Environment check timed out after 5s. Proceeding anyway.");
      setIsChecking(false);
    }, 5000);

    window.api.checkEnvironment().then((ready: boolean) => {
      console.log("[Renderer] Environment check result:", ready);
      clearTimeout(timeoutId);
      if (ready) {
        setIsReady(true);
      }
      setIsChecking(false);
    }).catch((err: any) => {
      console.error("[Renderer] Environment check failed:", err);
      clearTimeout(timeoutId);
      setIsChecking(false);
    });
  }, []);

  if (isChecking) {
    return null; // Brief blank while checking
  }

  if (!isReady) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <LoadingScreen onReady={() => setIsReady(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <HashRouter>
        <Routes>
          {renderRoutes()}
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);