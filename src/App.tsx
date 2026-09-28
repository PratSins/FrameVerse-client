import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { HomeView } from "./components/HomeView";
import ToonifyStudio from "./components/ToonifyStudio";
import { VChatView } from "./components/VChat/VChatView";
import { Footer } from "./components/Footer";
import { LoginModal } from "./components/LoginModal";

function FrameVerseRoutes() {
  const location = useLocation();
  const isVChat = location.pathname.startsWith("/vchat");

  return (
    <div className="app-layout">
      {/* Top Navigation Bar with Page Links */}
      <Navbar />

      {/* Main Page Content */}
      <main className="app">
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/toonify" element={<ToonifyStudio />} />
          <Route path="/vchat" element={<VChatView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Footer (hidden on vChat page) */}
      {!isVChat && <Footer />}

      {/* Authentication Modal */}
      <LoginModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FrameVerseRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
