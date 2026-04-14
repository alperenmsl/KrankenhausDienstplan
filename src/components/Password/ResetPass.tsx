import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./ResetPass.css";
import backgroundImage from "../../assets/Background.png";

const ResetPass: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setMessage("");

    if (password !== confirm) {
      setErrorMsg("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg("Fehler beim Speichern. Bitte versuche es erneut.");
    } else {
      setMessage("Passwort erfolgreich geändert! Du wirst weitergeleitet...");
      setTimeout(() => navigate("/"), 2500);
    }
    setLoading(false);
  };

  return (
    <div
      className="resetpass-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="blur-box">
        <div className="logo-title">
          DORNB<span className="logo-accent">|</span>RN
        </div>
        <div className="logo-subtitle">Krankenhaus</div>

        <h2>Neues Passwort setzen</h2>

        <form className="resetpass-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <span className="input-icon">🔒</span>
            <input
              type="password"
              placeholder="Neues Passwort"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="input-wrapper">
            <span className="input-icon">🔒</span>
            <input
              type="password"
              placeholder="Passwort bestätigen"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {errorMsg && <p className="msg error">{errorMsg}</p>}
          {message && <p className="msg success">{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Wird gespeichert..." : "Passwort speichern"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPass;
