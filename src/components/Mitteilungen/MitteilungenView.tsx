import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import "./MitteilungenView.css";

interface Profile {
  id: string;
  full_name: string;
  title: string;
}

interface Station {
  id: number;
  name: string;
  color: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id?: string | null;
  station_id?: number | null;
  content: string;
  created_at: string;
  is_read?: boolean;
  is_edited?: boolean;
  reactions?: Record<string, string[]>; // { emoji: [user_id1, user_id2] }
  file_url?: string;
  file_name?: string;
  sender?: { full_name: string } | null; // Für Gruppenchats
}

interface MitteilungenViewProps {
  userId: string;
}

interface SupabasePresencePayload {
  user_id: string;
  online_at: string;
}

const MitteilungenView: React.FC<MitteilungenViewProps> = ({ userId }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emojis = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const markAsRead = async (messageId: string) => {
    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("id", messageId);
  };

  useEffect(() => {
    const fetchData = async () => {
      console.log("Fetching profiles and stations for userId:", userId);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, title")
        .neq("id", userId);

      // Zuerst die Mitgliedschaften des aktuellen Users abrufen
      const { data: memberData, error: memberError } = await supabase
        .from("station_members")
        .select("station_id")
        .eq("profile_id", userId);

      if (memberError) {
        console.error("Fehler beim Laden der Mitgliedschaften:", memberError);
        setError(`Mitgliedschaften: ${memberError.message}`);
      }

      if (memberData && memberData.length > 0) {
        const stationIds = memberData.map((m) => m.station_id);
        const { data: stationsData, error: stationsError } = await supabase
          .from("stations")
          .select("id, name, color")
          .in("id", stationIds)
          .in("name", ["Unfall Ambulanz", "Innere Ambulanz"]);

        if (stationsError) setError(`Stationen: ${stationsError.message}`);
        if (stationsData) setStations(stationsData);
      } else {
        setStations([]); // Keine Mitgliedschaften = keine Gruppen
      }

      if (profilesError) setError(`Profile: ${profilesError.message}`);
      if (profilesData) setProfiles(profilesData);

      setLoading(false);
    };

    if (userId) {
      fetchData();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("online-users");

    channel
      .on("presence", { event: "sync" }, () => {
        const state: Record<
          string,
          Array<SupabasePresencePayload>
        > = channel.presenceState();
        const ids = Object.values(state)
          .flat()
          .map((p) => p.user_id);
        setOnlineUsers(ids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!selectedUser && !selectedStation) return;

    const fetchMessages = async () => {
      // Wir holen die Sender-Daten separat, falls die Beziehung im Cache fehlt
      let query = supabase.from("messages").select(
        `
      id,
      content,
      created_at,
      sender_id,
      receiver_id,
      station_id,
      is_read,
      is_edited,
      reactions,
      file_url,
      file_name,
      sender:profiles!sender_id(full_name)
    `,
      );

      if (selectedUser) {
        query = query.or(
          `and(sender_id.eq.${userId},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${userId})`,
        );
      } else if (selectedStation) {
        query = query.eq("station_id", selectedStation.id);
      }

      const { data, error } = await query.order("created_at", {
        ascending: true,
      });

      if (!error && data) {
        const enrichedMessages = data.map((msg) => ({
          ...msg,
          sender: msg.sender && !Array.isArray(msg.sender) ? msg.sender : null,
        }));
        setMessages(enrichedMessages);
      }
    };

    fetchMessages();

    const channelId = selectedUser
      ? `chat_${[userId, selectedUser.id].sort().join("_")}`
      : `station_${selectedStation?.id}`;

    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const msg = payload.new as Message;
            let isRelevant = false;

            if (selectedUser) {
              isRelevant =
                (msg.sender_id === userId &&
                  msg.receiver_id === selectedUser.id) ||
                (msg.sender_id === selectedUser.id &&
                  msg.receiver_id === userId);
            } else if (selectedStation) {
              isRelevant = msg.station_id === selectedStation.id;
            }

            if (isRelevant) {
              const enrichedMsg: Message = {
                ...msg,
                sender:
                  msg.sender && !Array.isArray(msg.sender) ? msg.sender : null,
              };

              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, enrichedMsg];
              });
              if (msg.receiver_id === userId) markAsRead(msg.id);
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as Message;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        if (selectedUser && payload.payload.user_id === selectedUser.id) {
          setIsTyping(payload.payload.isTyping);
        }
      })
      .subscribe();

    if (selectedUser) {
      const markAllAsRead = async () => {
        await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("sender_id", selectedUser.id)
          .eq("receiver_id", userId)
          .eq("is_read", false);
      };
      markAllAsRead();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUser, selectedStation, userId]);

  const toggleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    const currentReactions = msg.reactions || {};
    const users = currentReactions[emoji] || [];
    const hasReacted = users.includes(userId);

    let newUsers;
    if (hasReacted) {
      newUsers = users.filter((id) => id !== userId);
    } else {
      newUsers = [...users, userId];
    }

    const newReactions = { ...currentReactions };
    if (newUsers.length > 0) {
      newReactions[emoji] = newUsers;
    } else {
      delete newReactions[emoji];
    }

    const { error } = await supabase
      .from("messages")
      .update({ reactions: newReactions })
      .eq("id", messageId);

    if (error) {
      setError(`Fehler beim Reagieren: ${error.message}`);
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: newReactions } : m,
        ),
      );
    }
  };

  const deleteMessage = async (messageId: string) => {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId);
    if (error) {
      setError(`Fehler beim Löschen: ${error.message}`);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
    setShowMoreMenu(null);
  };

  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setShowMoreMenu(null);
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    const { error } = await supabase
      .from("messages")
      .update({
        content: editContent.trim(),
        is_edited: true,
      })
      .eq("id", editingMessageId);

    if (error) {
      setError(`Fehler beim Bearbeiten: ${error.message}`);
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessageId
            ? { ...m, content: editContent.trim(), is_edited: true }
            : m,
        ),
      );
    }
    setEditingMessageId(null);
  };

  const handleTyping = () => {
    if (!selectedUser) return;
    const channel = supabase.channel(
      `chat_${[userId, selectedUser.id].sort().join("_")}`,
    );
    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: userId, isTyping: true },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: userId, isTyping: false },
      });
    }, 2000);
  };

  const sendMessage = async (fileUrl?: string, fileName?: string) => {
    if ((!newMessage.trim() && !fileUrl) || (!selectedUser && !selectedStation))
      return;

    const msgData: Partial<Message> = {
      sender_id: userId,
      content: newMessage.trim(),
    };

    if (selectedUser) {
      msgData.receiver_id = selectedUser.id;
    } else if (selectedStation) {
      msgData.station_id = selectedStation.id;
    }

    if (fileUrl) {
      msgData.file_url = fileUrl;
      msgData.file_name = fileName;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([msgData])
      .select("*")
      .single();

    if (error) {
      setError(`Fehler beim Senden: ${error.message}`);
    } else if (data) {
      // Namen für die neue Nachricht nachladen
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const enrichedNewMsg = { ...data, sender: profile };

      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, enrichedNewMsg];
      });
      setNewMessage("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || (!selectedUser && !selectedStation)) return;

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `chat/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("chat-files")
      .upload(filePath, file);

    if (uploadError) {
      setError(`Upload-Fehler: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("chat-files").getPublicUrl(filePath);
    await sendMessage(data.publicUrl, file.name);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatDateHeader = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Heute";
    if (d.toDateString() === yesterday.toDateString()) return "Gestern";

    return d.toLocaleDateString("de-AT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (loading)
    return <div className="messages-loading">Lade Mitteilungen...</div>;

  return (
    <div className="mitteilungen-container fade-in">
      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="messenger-sidebar">
        <div className="sidebar-header">
          <h3>Stationen</h3>
        </div>
        <div className="user-list">
          {stations.map((s) => (
            <div
              key={s.id}
              className={`user-item ${selectedStation?.id === s.id ? "active" : ""}`}
              onClick={() => {
                setSelectedUser(null);
                setSelectedStation(s);
              }}
            >
              <div className="user-avatar-container">
                <div
                  className="user-avatar"
                  style={{ backgroundColor: s.color }}
                >
                  #
                </div>
              </div>
              <div className="user-info">
                <div className="user-name">{s.name}</div>
                <div className="user-title">Gruppenchat</div>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-header" style={{ marginTop: 20 }}>
          <h3>Mitarbeiter</h3>
        </div>
        <div className="user-list">
          {profiles.length === 0 && (
            <div className="empty-list-info">Keine Mitarbeiter gefunden.</div>
          )}
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`user-item ${selectedUser?.id === p.id ? "active" : ""}`}
              onClick={() => {
                setSelectedStation(null);
                setSelectedUser(p);
              }}
            >
              <div className="user-avatar-container">
                <div className="user-avatar">
                  {p.full_name ? p.full_name[0].toUpperCase() : "?"}
                </div>
                {onlineUsers.includes(p.id) && (
                  <div className="online-indicator" />
                )}
              </div>
              <div className="user-info">
                <div className="user-name">{p.full_name || "Unbekannt"}</div>
                <div className="user-title">{p.title || "Mitarbeiter"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="messenger-chat">
        {selectedUser || selectedStation ? (
          <>
            <div className="chat-header">
              <div className="user-avatar-container">
                <div
                  className="user-avatar"
                  style={
                    selectedStation
                      ? { backgroundColor: selectedStation.color }
                      : {}
                  }
                >
                  {selectedStation
                    ? "#"
                    : selectedUser?.full_name?.[0].toUpperCase() || "?"}
                </div>
                {selectedUser && onlineUsers.includes(selectedUser.id) && (
                  <div className="online-indicator" />
                )}
              </div>
              <div className="chat-user-details">
                <h4>
                  {selectedStation
                    ? selectedStation.name
                    : selectedUser?.full_name}
                </h4>
                <span>
                  {selectedStation ? "Gruppenchat" : selectedUser?.title}
                </span>
              </div>
            </div>
            <div className="chat-messages">
              {messages.map((msg, index) => {
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const showDateDivider =
                  !prevMsg ||
                  new Date(msg.created_at).toDateString() !==
                    new Date(prevMsg.created_at).toDateString();

                return (
                  <React.Fragment key={msg.id}>
                    {showDateDivider && (
                      <div className="date-divider">
                        <span className="date-label">
                          {formatDateHeader(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div
                      className={`message-bubble-wrapper ${msg.sender_id === userId ? "sent" : "received"}`}
                    >
                      {selectedStation && msg.sender_id !== userId && (
                        <div className="sender-name-small">
                          {msg.sender?.full_name || "Unbekannt"}
                        </div>
                      )}
                      <div
                        className={`message-bubble ${msg.sender_id === userId ? "sent" : "received"}`}
                      >
                        {editingMessageId === msg.id ? (
                          <div className="edit-mode-container">
                            <input
                              autoFocus
                              className="edit-mode-input"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape")
                                  setEditingMessageId(null);
                              }}
                            />
                            <div className="edit-actions">
                              <button
                                className="edit-btn cancel"
                                onClick={() => setEditingMessageId(null)}
                              >
                                Abbrechen
                              </button>
                              <button
                                className="edit-btn save"
                                onClick={saveEdit}
                              >
                                Speichern
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.file_url &&
                              (msg.file_url.match(
                                /\.(jpeg|jpg|gif|png|webp)$/i,
                              ) ? (
                                <img
                                  src={msg.file_url}
                                  alt="attachment"
                                  className="message-image"
                                  onClick={() =>
                                    window.open(msg.file_url, "_blank")
                                  }
                                />
                              ) : (
                                <a
                                  href={msg.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="message-file"
                                >
                                  <span className="file-icon">📄</span>
                                  <span className="file-name">
                                    {msg.file_name || "Datei"}
                                  </span>
                                </a>
                              ))}
                            <div className="message-content">{msg.content}</div>

                            <div className="message-action-bar">
                              <div className="action-emojis">
                                {emojis.map((emoji) => (
                                  <span
                                    key={emoji}
                                    className="action-emoji"
                                    onClick={() =>
                                      toggleReaction(msg.id, emoji)
                                    }
                                  >
                                    {emoji}
                                  </span>
                                ))}
                              </div>
                              {msg.sender_id === userId && (
                                <>
                                  <button
                                    className="action-btn"
                                    onClick={() => startEditing(msg)}
                                    title="Bearbeiten"
                                  >
                                    ✎
                                  </button>
                                  <div style={{ position: "relative" }}>
                                    <button
                                      className="action-btn"
                                      onClick={() =>
                                        setShowMoreMenu(
                                          showMoreMenu === msg.id
                                            ? null
                                            : msg.id,
                                        )
                                      }
                                      title="Mehr Optionen"
                                    >
                                      •••
                                    </button>
                                    {showMoreMenu === msg.id && (
                                      <div className="more-options-menu">
                                        <div
                                          className="menu-item danger"
                                          onClick={() => deleteMessage(msg.id)}
                                        >
                                          Nachricht zurückziehen
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}

                        {msg.reactions &&
                          Object.keys(msg.reactions).length > 0 && (
                            <div className="reactions-display">
                              {Object.entries(msg.reactions).map(
                                ([emoji, users]) => (
                                  <div
                                    key={emoji}
                                    className={`reaction-badge ${users.includes(userId) ? "active" : ""}`}
                                    onClick={() =>
                                      toggleReaction(msg.id, emoji)
                                    }
                                  >
                                    {emoji} {users.length > 1 && users.length}
                                  </div>
                                ),
                              )}
                            </div>
                          )}

                        <div className="message-info">
                          {msg.is_edited && (
                            <span className="is-edited">bearbeitet</span>
                          )}
                          <span className="message-time">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.sender_id === userId && (
                            <span className="read-status">
                              {msg.is_read ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {isTyping && (
              <div className="typing-indicator">
                {selectedUser?.full_name} schreibt...
              </div>
            )}
            {uploading && (
              <div className="upload-progress">Datei wird hochgeladen...</div>
            )}
            <div className="chat-input-area">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <button
                className="attachment-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Anhängen"
                disabled={uploading}
              >
                📎
              </button>
              <input
                type="text"
                placeholder="Nachricht schreiben..."
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={handleKeyDown}
                disabled={uploading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={(!newMessage.trim() && !uploading) || uploading}
              >
                Senden
              </button>
            </div>
          </>
        ) : (
          <div className="chat-placeholder">
            <div className="placeholder-icon">✉</div>
            <p>Wähle eine Station oder einen Mitarbeiter aus.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MitteilungenView;
