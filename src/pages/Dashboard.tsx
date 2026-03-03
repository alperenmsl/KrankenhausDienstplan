import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Dashboard.css";

type Section = "overview" | "dienstplan" | "mitteilungen" | "profil";

const navItems: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "ÜBERSICHT", icon: "⊞" },
  { key: "dienstplan", label: "DIENSTPLAN", icon: "📅" },
  { key: "mitteilungen", label: "MITTEILUNGEN", icon: "✉" },
  { key: "profil", label: "PROFIL", icon: "👤" },
];

const mockMessages = [
  {
    name: "Frederick Murphy",
    action: "hat deinen Beitrag geliked",
    time: "vor 7 Min",
    avatar: "FM",
  },
  {
    name: "Elisha Scott",
    action: "ist jetzt verfügbar",
    time: "vor 10 Std",
    avatar: "ES",
  },
  {
    name: "John Doe",
    action: "hat eine Nachricht gesendet",
    time: "vor 8 Std",
    avatar: "JD",
  },
  {
    name: "Monica Smith",
    action: "ist jetzt verfügbar",
    time: "vor 5 Std",
    avatar: "MS",
  },
];

const stationColors: Record<string, string> = {
  "Innere Ambulanz": "#22c55e",
  "Unfall Ambulanz": "#ef4444",
  Chirurgie: "#f59e0b",
  Intensivstation: "#8b5cf6",
};

const getShiftLabel = (start: string, overnight: boolean): string => {
  const h = parseInt(start.split(":")[0]);
  if (overnight || h >= 21) return "Nachtschicht";
  if (h < 10) return "Frühschicht";
  if (h < 14) return "Tagschicht";
  return "Spätschicht";
};

const shiftLabelColors: Record<string, string> = {
  Frühschicht: "#22c55e",
  Tagschicht: "#3b82f6",
  Spätschicht: "#f59e0b",
  Nachtschicht: "#8b5cf6",
};

interface ScheduleEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  overnight: boolean;
  notes?: string | null;
  stations: { name: string; short_code?: string; color: string }[] | null;
  shift_types?: { name: string; color: string }[] | null;
}

interface DayGroup {
  label: string;
  date: string;
  entries: ScheduleEntry[];
}

const formatTime = (t: string) => t.slice(0, 5);

const getDayLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const day = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${day} ${dd}.${mm}`;
};

const getCurrentWeekDates = () => {
  const today = new Date();
  const dow = today.getDay(); // 0=So, 1=Mo, ..., 6=Sa

  const monday = new Date(today);
  if (dow === 0) {
    // Sonntag → zeige kommende Woche (Mo+1)
    monday.setDate(today.getDate() + 1);
  } else {
    // Mo–Sa → zeige aktuelle Woche
    monday.setDate(today.getDate() - (dow - 1));
  }

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
};

const Dashboard: React.FC = () => {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("User");
  const [userId, setUserId] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<DayGroup[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [userProfile, setUserProfile] = useState<{
    full_name?: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email || "";
      const id = data.user?.id || null;
      setUserEmail(email);
      setUserId(id);
      setUserName(email.split("@")[0] || "User");

      if (id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, title")
          .eq("id", id)
          .single();
        if (profile) {
          setUserProfile(profile);
          if (profile.full_name) {
            setUserName(profile.full_name.split(" ").slice(-1)[0]);
          }
        }
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const loadSchedule = async () => {
      setLoadingSchedule(true);
      const weekDates = getCurrentWeekDates();
      const { data, error } = await supabase
        .from("schedule_entries")
        .select(
          `id, date, start_time, end_time, overnight, station_id, stations!schedule_entries_station_id_fkey ( name, color )`,
        )
        .eq("user_id", userId)
        .gte("date", weekDates[0])
        .lte("date", weekDates[4])
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        console.error(error);
        setLoadingSchedule(false);
        return;
      }

      const grouped: Record<string, ScheduleEntry[]> = {};
      weekDates.forEach((d) => {
        grouped[d] = [];
      });
      (data || []).forEach((entry: ScheduleEntry) => {
        if (grouped[entry.date]) grouped[entry.date].push(entry);
      });

      setScheduleData(
        weekDates.map((date) => ({
          label: getDayLabel(date),
          date,
          entries: grouped[date],
        })),
      );
      setLoadingSchedule(false);
    };
    loadSchedule();
  }, [userId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const displayName = userProfile?.full_name
    ? `${userProfile.title ? userProfile.title + " " : ""}${userProfile.full_name}`
    : userName;

  const initials = userProfile?.full_name
    ? userProfile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : userName.slice(0, 2).toUpperCase();

  const today = new Date().toISOString().split("T")[0];

  const renderScheduleCard = () => (
    <div className="card card-schedule">
      <div className="card-header">
        <span className="card-title">Dienstplan diese Woche</span>
        <span className="card-icon">📅</span>
      </div>
      {loadingSchedule ? (
        <div className="schedule-loading">Lade Dienstplan…</div>
      ) : (
        <div className="schedule-table">
          <div className="schedule-row schedule-head">
            {scheduleData.map((d) => (
              <div
                key={d.date}
                className={`schedule-day-header ${d.date === today ? "today" : ""}`}
              >
                {d.label}
              </div>
            ))}
          </div>
          <div className="schedule-row">
            {scheduleData.map((d) => (
              <div key={d.date} className="schedule-cell">
                {d.entries.length === 0 ? (
                  <div className="shift-empty">Frei</div>
                ) : (
                  d.entries.map((entry) => {
                    const stationName =
                      entry.stations?.[0]?.name || "Unbekannt";
                    const color =
                      entry.stations?.[0]?.color ||
                      stationColors[stationName] ||
                      "#64748b";
                    const shiftLabel = getShiftLabel(
                      entry.start_time,
                      entry.overnight,
                    );
                    const shiftColor = shiftLabelColors[shiftLabel] || color;
                    return (
                      <div
                        key={entry.id}
                        className="shift-chip"
                        style={{
                          background: shiftColor + "18",
                          borderLeft: `3px solid ${shiftColor}`,
                          color: shiftColor,
                        }}
                      >
                        <span className="shift-name">{shiftLabel}</span>
                        <span className="shift-time">
                          {formatTime(entry.start_time)} –{" "}
                          {formatTime(entry.end_time)}
                        </span>
                        <span className="shift-station">{stationName}</span>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        className="card-link"
        onClick={() => setActiveSection("dienstplan")}
      >
        Vollständiger Dienstplan →
      </button>
    </div>
  );

  const renderOverview = () => (
    <div className="overview-grid fade-in">
      <div className="welcome-banner">
        <div className="welcome-text">
          <h1>
            Herzlich willkommen,{" "}
            <span className="highlight">{displayName}</span>
          </h1>
          <p className="welcome-sub">Hier ist deine Übersicht für heute</p>
        </div>
        <div className="date-badge">
          {new Date().toLocaleDateString("de-AT", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>
      <div className="cards-row">
        {renderScheduleCard()}
        <div className="card card-messages">
          <div className="card-header">
            <span className="card-title">Nachrichten</span>
            <span className="badge-count">{mockMessages.length}</span>
          </div>
          <div className="messages-list">
            {mockMessages.map((msg, i) => (
              <div key={i} className="message-item">
                <div className="msg-avatar">{msg.avatar}</div>
                <div className="msg-body">
                  <div className="msg-name">{msg.name}</div>
                  <div className="msg-action">{msg.action}</div>
                </div>
                <div className="msg-time">{msg.time}</div>
              </div>
            ))}
          </div>
          <button
            className="card-link"
            onClick={() => setActiveSection("mitteilungen")}
          >
            Alle anzeigen →
          </button>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return renderOverview();
      case "dienstplan":
        return (
          <div className="fade-in placeholder-section">
            <h2>Vollständiger Dienstplan</h2>
            <p>Kommt bald.</p>
          </div>
        );
      case "mitteilungen":
        return (
          <div className="fade-in placeholder-section">
            <h2>Mitteilungen</h2>
            <p>Hier werden alle Mitteilungen angezeigt.</p>
          </div>
        );
      case "profil":
        return (
          <div className="fade-in placeholder-section">
            <h2>Profil</h2>
            <p>
              <strong>{displayName}</strong>
            </p>
            <p>{userEmail}</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-root">
      <aside className="db-sidebar">
        <div className="db-logo">
          <span className="db-logo-main">
            DORNB<span className="db-logo-accent">|</span>RN
          </span>
          <span className="db-logo-sub">KRANKENHAUS</span>
        </div>
        <nav className="db-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`db-nav-item ${activeSection === item.key ? "active" : ""}`}
              onClick={() => setActiveSection(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {activeSection === item.key && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <button className="logout-btn" onClick={handleLogout}>
          <span>↩</span> Abmelden
        </button>
      </aside>
      <div className="db-main">
        <header className="db-topbar">
          <div className="topbar-title">
            {navItems.find((n) => n.key === activeSection)?.label}
          </div>
          <div className="topbar-right">
            <div className="topbar-email">{userEmail}</div>
            <div className="topbar-avatar">{initials}</div>
          </div>
        </header>
        <main className="db-content">{renderContent()}</main>
      </div>
    </div>
  );
};

export default Dashboard;
