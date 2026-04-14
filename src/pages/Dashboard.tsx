import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import DienstplanView from "../components/Dienstplan/DienstplanView";
import MitteilungenView from "../components/Mitteilungen/MitteilungenView";
import AdminPanel from "../components/Admin/AdminPanel";
import type {
  DayGroup,
  ScheduleEntry,
} from "../components/Dienstplan/DienstplanView";
import "./Dashboard.css";

type Section = "overview" | "dienstplan" | "mitteilungen" | "profil" | "admin";

const adminUids = [
  "b09cb847-18dc-4d6f-b5fb-8a3444e17d8e", // Alperen
  "4c6ca66c-854a-44c0-a959-cd10d8ace65b", // Nihat
];

const navItems: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "ÜBERSICHT", icon: "⊞" },
  { key: "dienstplan", label: "DIENSTPLAN", icon: "📅" },
  { key: "admin", label: "ADMIN", icon: "⚙" },
  { key: "mitteilungen", label: "MITTEILUNGEN", icon: "✉" },
  { key: "profil", label: "PROFIL", icon: "👤" },
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

const formatTime = (t: string) => t.slice(0, 5);

const getDayLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getCurrentWeekDates = (): string[] => {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  if (dow === 0) mon.setDate(today.getDate() + 1);
  else mon.setDate(today.getDate() - (dow - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d.toISOString().split("T")[0];
  });
};

const playNotificationSound = () => {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();

    const playTone = (freq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.15);
    playTone(1108.7, now + 0.15, 0.25);
  } catch (e) {
    console.warn("Sound konnte nicht abgespielt werden:", e);
  }
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
  const [dashboardMessages, setDashboardMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

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
          if (profile.full_name)
            setUserName(profile.full_name.split(" ").slice(-1)[0]);
        }
      }
    };
    getUser();
  }, []);

  // Mini overview fetch (current week only)
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoadingSchedule(true);
      const weekDates = getCurrentWeekDates();

      const { data: entries, error } = await supabase
        .from("schedule_entries")
        .select("id, date, start_time, end_time, overnight, notes, station_id")
        .eq("user_id", userId)
        .gte("date", weekDates[0])
        .lte("date", weekDates[4])
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      const { data: stations } = await supabase
        .from("stations")
        .select("id, name, color");

      if (error) {
        setLoadingSchedule(false);
        return;
      }

      const stationMap: Record<number, { name: string; color: string }> = {};
      (stations || []).forEach(
        (s: { id: number; name: string; color: string }) => {
          stationMap[s.id] = s;
        },
      );

      const enriched: ScheduleEntry[] = (entries || []).map((e: any) => ({
        ...e,
        stations:
          e.station_id && stationMap[e.station_id]
            ? [stationMap[e.station_id]]
            : null,
      }));

      const grouped: Record<string, ScheduleEntry[]> = {};
      weekDates.forEach((d) => {
        grouped[d] = [];
      });
      enriched.forEach((e) => {
        if (grouped[e.date]) grouped[e.date].push(e);
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
    load();
  }, [userId]);

  // Dashboard messages fetch + Realtime
  useEffect(() => {
    if (!userId) return;

    const fetchDashboardMessages = async () => {
      setLoadingMessages(true);

      // Erst mit JOIN versuchen
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
      id,
      content,
      created_at,
      sender_id,
      sender:profiles!sender_id(full_name)
    `,
        )
        .eq("receiver_id", userId)
        .order("created_at", { ascending: false })
        .limit(4);

      if (!error && data) {
        setDashboardMessages(data);
      } else {
        // Fallback: ohne JOIN, dann Namen separat laden
        console.error("Join-Fehler:", error);
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, content, created_at, sender_id")
          .eq("receiver_id", userId)
          .order("created_at", { ascending: false })
          .limit(4);

        if (msgs) {
          // Sender-Namen einzeln laden
          const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", senderIds);

          const profileMap: Record<string, string> = {};
          (profilesData || []).forEach((p) => {
            profileMap[p.id] = p.full_name;
          });

          setDashboardMessages(
            msgs.map((m) => ({
              ...m,
              sender: { full_name: profileMap[m.sender_id] || "Unbekannt" },
            })),
          );
        }
      }
      setLoadingMessages(false);
    };

    fetchDashboardMessages();

    const channel = supabase
      .channel(`dashboard_msgs_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (_payload) => {
          playNotificationSound();
          setHasNewMessage(true);
          fetchDashboardMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  // ── MINI SCHEDULE CARD ──
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
                    const st = entry.stations?.[0]?.name ?? "";
                    const sc =
                      entry.stations?.[0]?.color ??
                      stationColors[st] ??
                      "#64748b";
                    const label = getShiftLabel(
                      entry.start_time,
                      entry.overnight,
                    );
                    const color = shiftLabelColors[label] ?? sc;
                    return (
                      <div
                        key={entry.id}
                        className="shift-chip"
                        style={{
                          background: color + "18",
                          borderLeft: `3px solid ${color}`,
                          color,
                        }}
                      >
                        <span className="shift-name">{label}</span>
                        <span className="shift-time">
                          {formatTime(entry.start_time)} –{" "}
                          {formatTime(entry.end_time)}
                        </span>
                        <span className="shift-station">{st || "—"}</span>
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

  // ── OVERVIEW ──
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {hasNewMessage && (
                <span className="new-msg-dot" title="Neue Nachricht" />
              )}
              <span className="badge-count">{dashboardMessages.length}</span>
            </div>
          </div>
          <div className="messages-list">
            {loadingMessages ? (
              <div className="messages-loading">Lade Nachrichten...</div>
            ) : dashboardMessages.length > 0 ? (
              dashboardMessages.map((msg, i) => (
                <div key={i} className="message-item">
                  <div className="msg-avatar">
                    {(msg.sender as any)?.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="msg-body">
                    <div className="msg-name">
                      {(msg.sender as any)?.full_name || "Unbekannt"}
                    </div>
                    <div className="msg-action">{msg.content}</div>
                  </div>
                  <div className="msg-time">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-messages">Keine neuen Nachrichten</div>
            )}
          </div>
          <button
            className="card-link"
            onClick={() => {
              setHasNewMessage(false);
              setActiveSection("mitteilungen");
            }}
          >
            Alle anzeigen →
          </button>
        </div>
      </div>
    </div>
  );

  const isAdmin = userId && adminUids.includes(userId);

  const filteredNavItems = navItems.filter((item) => {
    if (isAdmin) {
      // Admins sehen keinen Dienstplan, sondern Admin Panel
      return item.key !== "dienstplan";
    } else {
      // Normale User sehen kein Admin Panel
      return item.key !== "admin";
    }
  });

  // ── CONTENT ROUTER ──
  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return renderOverview();
      case "dienstplan":
        return isAdmin ? null : userId ? (
          <DienstplanView userId={userId} />
        ) : null;
      case "admin":
        return isAdmin ? <AdminPanel /> : null;
      case "mitteilungen":
        return userId ? <MitteilungenView userId={userId} /> : null;
      case "profil":
        return (
          <div className="fade-in placeholder-section">
            <h2>Profil</h2>
            <p>
              <strong>{displayName}</strong>
            </p>
            <p style={{ marginTop: 6 }}>{userEmail}</p>
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
          {filteredNavItems.map((item) => (
            <button
              key={item.key}
              className={`db-nav-item ${activeSection === item.key ? "active" : ""}`}
              onClick={() => {
                if (item.key === "mitteilungen") setHasNewMessage(false);
                setActiveSection(item.key);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.key === "mitteilungen" && hasNewMessage && (
                <span className="nav-badge" />
              )}
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
