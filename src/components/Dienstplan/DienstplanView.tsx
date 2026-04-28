import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./DienstplanView.css";

// ── TYPES ──
export interface ScheduleEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  overnight: boolean;
  notes?: string | null;
  station_id?: number;
  stations: { name: string; color: string }[] | null;
}

export interface DayGroup {
  label: string;
  date: string;
  entries: ScheduleEntry[];
}

interface DienstplanViewProps {
  userId: string;
}

// ── CONSTANTS ──
const HOUR_HEIGHT = 60;
const DAY_START = 5;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => DAY_START + i);

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

// ── HELPERS ──
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromStart = (t: string) => toMinutes(t) - DAY_START * 60;
const formatTime = (t: string) => t.slice(0, 5);
const isoDate = (d: Date) => d.toISOString().split("T")[0];

const getMondayOf = (d: Date): Date => {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return mon;
};

const getWeekDates = (monday: Date): string[] =>
  Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return isoDate(d);
  });

const getDayLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ── COMPONENT ──
const DienstplanView: React.FC<DienstplanViewProps> = ({ userId }) => {
  const today = isoDate(new Date());

  const [monday, setMonday] = useState<Date>(() => {
    const m = getMondayOf(new Date());
    if (new Date().getDay() === 0) m.setDate(m.getDate() + 7);
    return m;
  });

  const [scheduleData, setScheduleData] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateInput, setDateInput] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  const nowLineRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  // Scroll to now-line after load
  useEffect(() => {
    if (!loading && scrollAreaRef.current) {
      const nowTopPx = ((nowMinutes - DAY_START * 60) / 60) * HOUR_HEIGHT;
      const scrollTarget = Math.max(0, nowTopPx - 200);
      scrollAreaRef.current.scrollTop = scrollTarget;
    }
  }, [loading, nowMinutes]);

  // Fetch
  const fetchWeek = useCallback(
    async (mon: Date) => {
      if (!userId) return;
      setLoading(true);
      const weekDates = getWeekDates(mon);

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
        console.error(error);
        setLoading(false);
        return;
      }

      const stationMap: Record<number, { name: string; color: string }> = {};
      (stations || []).forEach(
        (s: { id: number; name: string; color: string }) => {
          stationMap[s.id] = { name: s.name, color: s.color };
        },
      );

      const enriched: ScheduleEntry[] = (entries || []).map((e) => ({
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
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    const load = async () => {
      await fetchWeek(monday);
    };
    load();
  }, [monday, fetchWeek]);

  // Navigation
  const prevWeek = () => {
    const m = new Date(monday);
    m.setDate(m.getDate() - 7);
    setMonday(m);
  };
  const nextWeek = () => {
    const m = new Date(monday);
    m.setDate(m.getDate() + 7);
    setMonday(m);
  };
  const goToday = () => {
    const m = getMondayOf(new Date());
    if (new Date().getDay() === 0) m.setDate(m.getDate() + 7);
    setMonday(m);
  };

  const handleDateJump = () => {
    if (!dateInput) return;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return;
    setMonday(getMondayOf(d));
    setShowDatePicker(false);
    setDateInput("");
  };

  const weekDates = getWeekDates(monday);
  const isThisWeek = weekDates.includes(today);
  const nowTopPx = ((nowMinutes - DAY_START * 60) / 60) * HOUR_HEIGHT;
  const nowTimeStr = `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`;

  const formatWeekRange = () => {
    const s = new Date(weekDates[0]).toLocaleDateString("de-AT", {
      day: "2-digit",
      month: "long",
    });
    const e = new Date(weekDates[4]).toLocaleDateString("de-AT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return `${s} – ${e}`;
  };

  return (
    <div className="dp-root fade-in">
      {/* ── HEADER ── */}
      <div className="dp-header">
        <div className="dp-header-left">
          <h2 className="dp-title">Dienstplan</h2>
          <p className="dp-subtitle">{formatWeekRange()}</p>
        </div>
        <div className="dp-header-right">
          <div className="dp-legend">
            {Object.entries(shiftLabelColors).map(([label, color]) => (
              <div key={label} className="dp-legend-item">
                <span className="dp-legend-dot" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="dp-nav">
            <button className="dp-nav-btn" onClick={prevWeek}>
              ‹
            </button>
            <button
              className={`dp-today-btn ${isThisWeek ? "dp-today-active" : ""}`}
              onClick={goToday}
            >
              Heute
            </button>
            <button className="dp-nav-btn" onClick={nextWeek}>
              ›
            </button>
            <div className="dp-datepicker-wrapper">
              <button
                className="dp-nav-btn"
                onClick={() => setShowDatePicker((v) => !v)}
                title="Datum wählen"
              >
                📅
              </button>
              {showDatePicker && (
                <div className="dp-datepicker-popup">
                  <p className="dp-datepicker-label">Zur Woche springen:</p>
                  <input
                    type="date"
                    className="dp-datepicker-input"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                  />
                  <button className="dp-datepicker-go" onClick={handleDateJump}>
                    Los →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── GRID ── */}
      {loading ? (
        <div className="dp-loading">
          <div className="dp-loading-spinner" />
          <span>Lade Dienstplan…</span>
        </div>
      ) : (
        <div className="dp-grid-wrapper">
          {/* Sticky day-header row */}
          <div className="dp-sticky-header">
            <div className="dp-sticky-header-spacer" />
            {scheduleData.map((day) => {
              const isCurrentDay = day.date === today;
              return (
                <div
                  key={day.date}
                  className={`dp-day-header ${isCurrentDay ? "dp-day-header-today" : ""}`}
                >
                  <span className="dp-day-name">{day.label.split(" ")[0]}</span>
                  <span
                    className={`dp-day-num ${isCurrentDay ? "dp-day-num-today" : ""}`}
                  >
                    {day.label.split(" ")[1]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable body */}
          <div className="dp-scroll-body" ref={scrollAreaRef}>
            {/* Time labels */}
            <div className="dp-time-col">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="dp-hour-label"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            <div
              className="dp-days-grid"
              style={{
                gridTemplateColumns: `repeat(${scheduleData.length}, 1fr)`,
              }}
            >
              {scheduleData.map((day) => {
                const isCurrentDay = day.date === today;
                return (
                  <div
                    key={day.date}
                    className={`dp-day-col ${isCurrentDay ? "dp-day-today" : ""}`}
                  >
                    <div
                      className="dp-day-body"
                      style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
                    >
                      {/* Grid lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          className="dp-grid-line"
                          style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
                        />
                      ))}

                      {/* Shift blocks */}
                      {day.entries.map((entry) => {
                        const startMin = fromStart(entry.start_time);
                        const endMin = entry.overnight
                          ? (DAY_END - DAY_START) * 60
                          : fromStart(entry.end_time);
                        const topPx = (startMin / 60) * HOUR_HEIGHT;
                        const heightPx = Math.max(
                          ((endMin - startMin) / 60) * HOUR_HEIGHT,
                          32,
                        );
                        const station = entry.stations?.[0]?.name ?? "";
                        const sColor =
                          entry.stations?.[0]?.color ??
                          stationColors[station] ??
                          "#64748b";
                        const label = getShiftLabel(
                          entry.start_time,
                          entry.overnight,
                        );
                        const color = shiftLabelColors[label] ?? sColor;

                        return (
                          <div
                            key={entry.id}
                            className="dp-shift-block"
                            style={{
                              top: topPx,
                              height: heightPx,
                              background: color + "22",
                              borderLeft: `3px solid ${color}`,
                              color,
                            }}
                          >
                            <span className="dp-shift-label">{label}</span>
                            {station && (
                              <span className="dp-shift-station">
                                {station}
                              </span>
                            )}
                            <span className="dp-shift-time">
                              {formatTime(entry.start_time)} –{" "}
                              {formatTime(entry.end_time)}
                              {entry.overnight ? " 🌙" : ""}
                            </span>
                          </div>
                        );
                      })}

                      {/* Now-line */}
                      {isCurrentDay &&
                        isThisWeek &&
                        nowTopPx >= 0 &&
                        nowTopPx <= TOTAL_HOURS * HOUR_HEIGHT && (
                          <div
                            ref={nowLineRef}
                            className="dp-now-line"
                            style={{ top: nowTopPx }}
                          >
                            <div className="dp-now-dot" />
                            <div className="dp-now-bar" />
                            <span className="dp-now-label">{nowTimeStr}</span>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DienstplanView;
