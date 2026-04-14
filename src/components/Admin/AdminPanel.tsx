import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import "./AdminPanel.css";

const AdminPanel: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // 1. User in Auth erstellen
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // 2. Profil in der profiles Tabelle erstellen (UPSERT statt INSERT)
        const { error: profileError } = await supabase.from("profiles").upsert([
          {
            id: authData.user.id,
            full_name: fullName,
            title: title,
          },
        ]);

        if (profileError) throw profileError;

        setMessage({
          type: "success",
          text: `Benutzer ${fullName} erfolgreich erstellt!`,
        });
        // Felder zurücksetzen
        setEmail("");
        setPassword("");
        setFullName("");
        setTitle("");
      }
    } catch (err: any) {
      console.error("Fehler beim Erstellen des Benutzers:", err);
      setMessage({
        type: "error",
        text: err.message || "Ein Fehler ist aufgetreten.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel fade-in">
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <p>Verwaltung der Krankenhaus-Plattform</p>
      </div>

      <div className="admin-grid">
        {/* User hinzufügen Sektion */}
        <div className="admin-card">
          <h3>Neuen Mitarbeiter hinzufügen</h3>
          <p className="card-desc">
            Erstellt einen neuen Login und ein dazugehöriges Profil.
          </p>

          <form onSubmit={handleAddUser} className="admin-form">
            <div className="form-group">
              <label>Vollständiger Name</label>
              <input
                type="text"
                placeholder="z.B. Max Mustermann"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Berufsbezeichnung / Titel</label>
              <input
                type="text"
                placeholder="z.B. Diplomkrankenschwester"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>E-Mail Adresse</label>
              <input
                type="email"
                placeholder="name@kh-dornbirn.at"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Passwort</label>
              <input
                type="password"
                placeholder="Temporäres Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {message && (
              <div className={`admin-message ${message.type}`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              className="admin-submit-btn"
              disabled={loading}
            >
              {loading ? "Wird erstellt..." : "Benutzer anlegen"}
            </button>
          </form>
        </div>

        {/* Platzhalter für weitere Funktionen */}
        <div className="admin-card disabled">
          <h3>Stationen verwalten</h3>
          <p>Demnächst: Stationen hinzufügen oder bearbeiten.</p>
        </div>

        <div className="admin-card disabled">
          <h3>Dienstplan-Editor</h3>
          <p>Demnächst: Schichten für alle Mitarbeiter festlegen.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
