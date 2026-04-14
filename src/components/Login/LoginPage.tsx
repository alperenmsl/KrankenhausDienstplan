import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./LoginPage.css";
import backgroundImage from "../../assets/Background.png";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("Login fehlgeschlagen!");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div
      className="login-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="blur-box">
        <div className="logo-title">
          DORNB<span className="logo-accent">|</span>RN
        </div>
        <div className="logo-subtitle">Krankenhaus</div>

        <h2>Anmeldung zum Dienstplan</h2>

        <form className="login-form" onSubmit={handleLogin}>
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

          <div className="input-wrapper">
            <span className="input-icon">🔒</span>
            <input
              type="password"
              placeholder="Passwort"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {errorMsg && <p style={{ color: "red" }}>{errorMsg}</p>}

          <button type="submit">Einloggen</button>

          <button className="forgot-password" onClick={() => navigate("/forgot-password")}>
            Passwort vergessen?
          </button>

          
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
