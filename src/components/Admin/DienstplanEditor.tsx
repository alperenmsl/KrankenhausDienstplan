import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import "./DienstplanEditor.css";

interface Station {
  id: number;
  name: string;
  color: string;
}

interface ScheduleEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  overnight: boolean;
  notes: string | null;
  station_id: number | null;
}

interface DienstplanEditorProps {
  userId: string;
}

const DienstplanEditor: React.FC<DienstplanEditorProps> = ({ userId }) => {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [newDate, setNewDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [newStart, setNewStart] = useState("07:00");
  const [newEnd, setNewEnd] = useState("15:30");
  const [newStation, setNewStation] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");
  const [isOvernight, setIsOvernight] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Month navigation state
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    console.log("Fetching data for user:", userId);

    // Calculate start and end dates for the current month
    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0); // Last day of the month

    const startDateISO = startDate.toISOString().split("T")[0];
    const endDateISO = endDate.toISOString().split("T")[0];

    // Stations laden
    const { data: stationsData, error: stationsError } = await supabase
      .from("stations")
      .select("*")
      .order("name");

    if (stationsError) console.error("Error fetching stations:", stationsError);
    if (stationsData) setStations(stationsData);

    // Dienstplan laden (Schichten des Users für den ausgewählten Monat)
    const { data: scheduleData, error: scheduleError } = await supabase
      .from("schedule_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDateISO)
      .lte("date", endDateISO)
      .order("date", { ascending: false })
      .order("start_time", { ascending: true });

    if (scheduleError) {
      console.error("Error fetching schedule:", scheduleError);
      alert("Fehler beim Laden des Dienstplans: " + scheduleError.message);
    }

    console.log("Loaded schedule data for " + userId + ":", scheduleData);
    setSchedule(scheduleData || []);
    setLoading(false);
  }, [userId, currentMonth, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewStart("07:00");
    setNewEnd("15:30");
    setNewStation("");
    setNewNotes("");
    setIsOvernight(false);
    setEditingId(null);
  };

  const handlePreviousMonth = () => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 0) {
        setCurrentYear((prevYear) => prevYear - 1);
        return 11;
      }
      return prevMonth - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 11) {
        setCurrentYear((prevYear) => prevYear + 1);
        return 0;
      }
      return prevMonth + 1;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const shiftData = {
      user_id: userId,
      date: newDate,
      start_time: newStart,
      end_time: newEnd,
      station_id: newStation ? parseInt(newStation) : null,
      notes: newNotes,
      overnight: isOvernight,
    };

    if (editingId) {
      // Update
      const { error } = await supabase
        .from("schedule_entries")
        .update(shiftData)
        .eq("id", editingId);

      if (error) {
        console.error("Update error:", error);
        alert("Fehler beim Aktualisieren: " + error.message);
      } else {
        fetchData();
        resetForm();
      }
    } else {
      // Insert
      const { error } = await supabase
        .from("schedule_entries")
        .insert([shiftData]);

      if (error) {
        console.error("Insert error:", error);
        alert("Fehler beim Hinzufügen: " + error.message);
      } else {
        fetchData();
        resetForm();
      }
    }
  };

  const handleEditClick = (s: ScheduleEntry) => {
    setEditingId(s.id);
    setNewDate(s.date);
    setNewStart(s.start_time.slice(0, 5));
    setNewEnd(s.end_time.slice(0, 5));
    setNewStation(s.station_id?.toString() || "");
    setNewNotes(s.notes || "");
    setIsOvernight(s.overnight);

    // Scroll zum Formular
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteShift = async (id: number) => {
    if (!confirm("Schicht wirklich löschen?")) return;

    const { error } = await supabase
      .from("schedule_entries")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Fehler beim Löschen: " + error.message);
    } else {
      fetchData();
    }
  };

  if (loading) return <div className="editor-loading">Lädt Dienstplan...</div>;

  return (
    <div className="dienstplan-editor">
      <div className="editor-grid">
        {/* Neue Schicht Formular */}
        <div className="editor-card add-shift">
          <h4>{editingId ? "Schicht bearbeiten" : "Schicht hinzufügen"}</h4>
          <form onSubmit={handleSubmit} className="add-shift-form">
            <div className="form-row">
              <div className="form-group">
                <label>Datum</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Station</label>
                <select
                  value={newStation}
                  onChange={(e) => setNewStation(e.target.value)}
                >
                  <option value="">Keine Station</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Beginn</label>
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Ende</label>
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group checkbox-group">
              <input
                type="checkbox"
                id="overnight"
                checked={isOvernight}
                onChange={(e) => setIsOvernight(e.target.checked)}
              />
              <label htmlFor="overnight">Nachtschicht (über Mitternacht)</label>
            </div>

            <div className="form-group">
              <label>Notizen</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optionale Notizen..."
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? "Änderungen speichern" : "Schicht speichern"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetForm}
                >
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Bestehende Schichten Liste */}
        <div className="editor-card shift-list">
          <div className="month-navigation">
            <button
              type="button"
              className="btn-month-nav"
              onClick={handlePreviousMonth}
            >
              &lt;
            </button>
            <h4>
              {new Date(currentYear, currentMonth).toLocaleDateString("de-AT", {
                month: "long",
                year: "numeric",
              })}
            </h4>
            <button
              type="button"
              className="btn-month-nav"
              onClick={handleNextMonth}
            >
              &gt;
            </button>
          </div>
          {schedule.length === 0 ? (
            <p className="no-shifts">
              Keine Schichten für diesen Zeitraum gefunden.
            </p>
          ) : (
            <div className="shifts-table-container">
              <table className="shifts-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Zeit</th>
                    <th>Station</th>
                    <th className="actions-header">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s) => {
                    const station = stations.find(
                      (st) => st.id === s.station_id,
                    );
                    return (
                      <tr key={s.id}>
                        <td>
                          {new Date(s.date).toLocaleDateString("de-AT", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </td>
                        <td>
                          {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}{" "}
                          {s.overnight && "🌙"}
                        </td>
                        <td>
                          <span
                            className="station-tag"
                            style={{
                              backgroundColor: station?.color + "20",
                              color: station?.color,
                              border: `1px solid ${station?.color}`,
                            }}
                          >
                            {station?.name || "—"}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button
                            className="btn-edit"
                            onClick={() => handleEditClick(s)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            className="btn-delete"
                            onClick={() => handleDeleteShift(s.id)}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DienstplanEditor;
