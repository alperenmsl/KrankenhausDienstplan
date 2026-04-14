import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./PassV.css";
import backgroundImage from "../../assets/Background.png";

const PassV: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setMessage("E-Mail gesendet! Bitte prüfe deinen Posteingang.");
    }
    setLoading(false);
  };

  return (
    <div
      className="passvergessen-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="blur-box">
        <div className="logo-title">
          DORNB<span className="logo-accent">|</span>RN
        </div>
        <div className="logo-subtitle">Krankenhaus</div>

        <h2>Passwort vergessen</h2>
        <p className="passvergessen-hinweis">
          Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum
          Zurücksetzen deines Passworts.
        </p>

        <form className="passvergessen-form" onSubmit={handleReset}>
          <div className="input-wrapper">
            <span className="input-icon">✉</span>
            <input
              type="email"
              placeholder="E-Mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {errorMsg && <p className="msg error">{errorMsg}</p>}
          {message && <p className="msg success">{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Wird gesendet..." : "Reset-Link senden"}
          </button>

          <button
            type="button"
            className="back-to-login"
            onClick={() => navigate("/")}
          >
            ← Zurück zum Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default PassV;
