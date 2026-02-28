import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Dashboard.css";

const Dashboard: React.FC = () => {
  const [activeSection, setActiveSection] = useState("overview");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email || "");
    };

    getUser();
  }, []);

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div>
            <h2>Übersicht</h2>
            <p>
              Herzlich willkommen, <strong>{userEmail}</strong>
            </p>
          </div>
        );
      case "actions":
        return <h2>Aktionen</h2>;
      case "messages":
        return <h2>Mitteilungen</h2>;
      case "profile":
        return <h2>Profil</h2>;
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <h2 className="logo">Dashboard</h2>

        <nav>
          <button
            className={activeSection === "overview" ? "active" : ""}
            onClick={() => setActiveSection("overview")}
          >
            Übersicht
          </button>

          <button
            className={activeSection === "actions" ? "active" : ""}
            onClick={() => setActiveSection("actions")}
          >
            Aktionen
          </button>

          <button
            className={activeSection === "messages" ? "active" : ""}
            onClick={() => setActiveSection("messages")}
          >
            Mitteilungen
          </button>

          <button
            className={activeSection === "profile" ? "active" : ""}
            onClick={() => setActiveSection("profile")}
          >
            Profil
          </button>
        </nav>
      </aside>

      <main className="content">{renderContent()}</main>
    </div>
  );
};

export default Dashboard;
