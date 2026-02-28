import React from "react";
import "./LoginPage.css";
import backgroundImage from "../../assets/Background.png";

const LoginPage: React.FC = () => {
  return (
    <div
      className="login-container"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="blur-box">
        {/* Logo */}
        <div className="logo-title">
          DORNB<span className="logo-accent">|</span>RN
        </div>
        <div className="logo-subtitle">Krankenhaus</div>

        <h2>Anmeldung zum Dienstplan</h2>

        <form className="login-form">
          <div className="input-wrapper">
            <span className="input-icon">✉</span>
            <input type="email" placeholder="E-Mail" required />
          </div>

          <div className="input-wrapper">
            <span className="input-icon">🔒</span>
            <input type="password" placeholder="Passwort" required />
          </div>

          <button type="submit">Einloggen</button>

          <a href="#" className="forgot-password">
            Passwort vergessen?
          </a>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
