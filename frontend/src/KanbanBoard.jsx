import { useEffect, useState } from "react";
import { api } from "./api";

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

export default function KanbanBoard({ boardId, workspace, canEdit }) {
  const [board, setBoard] = useState(null);
  const [issues, setIssues] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { status, beforeId }; beforeId null means "append"
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [b, i] = await Promise.all([
        api(`/boards/${boardId}/`, { workspace }),
        api(`/issues/?board=${boardId}`, { workspace }),
      ]);
      setBoard(b);
      setIssues(i.results);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { setBoard(null); load(); }, [boardId, workspace]);

  async function drop(status) {
    const id = dragId;
    const target = over;
    setDragId(null);
    setOver(null);
    if (id == null || (target && target.beforeId === id)) return;

    // Index among the other issues in the target column, which is what the server expects.
    const others = issues.filter(i => i.status === status && i.id !== id).sort(byPosition);
    const at = target && target.status === status && target.beforeId != null
      ? others.findIndex(i => i.id === target.beforeId)
      : -1;
    const index = at === -1 ? others.length : at;

    const snapshot = issues;
    setIssues(cur => cur.map(i => (i.id === id ? { ...i, status } : i)));
    try {
      await api(`/issues/${id}/move/`, { method: "POST", workspace, body: { status, index } });
      await load(); // server is the source of truth for positions
    } catch (e) {
      setIssues(snapshot);
      setError(e.message);
    }
  }

  async function addIssue(e) {
    e.preventDefault();
    try {
      await api("/issues/", { method: "POST", workspace, body: { project: board.project, board: boardId, title } });
      setTitle("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!board) return <p>{error || "Loading board…"}</p>;

  return (
    <div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {canEdit && (
        <form onSubmit={addIssue} style={{ marginBottom: 8 }}>
          <input placeholder="New issue title" value={title} onChange={e => setTitle(e.target.value)} required />
          <button type="submit">Add issue</button>
        </form>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        {board.columns.map(col => (
          <section
            key={col}
            onDragOver={e => { if (!canEdit) return; e.preventDefault(); setOver({ status: col, beforeId: null }); }}
            onDrop={e => { e.preventDefault(); drop(col); }}
            style={{ flex: 1, minHeight: 300, background: "#f4f5f7", padding: 8, borderRadius: 8 }}
          >
            <h4>{col}</h4>
            {issues.filter(i => i.status === col).sort(byPosition).map(i => (
              <article
                key={i.id}
                draggable={canEdit}
                onDragStart={() => setDragId(i.id)}
                onDragOver={e => {
                  if (!canEdit) return;
                  e.preventDefault();
                  e.stopPropagation(); // keep the column handler from resetting the insert point
                  setOver({ status: col, beforeId: i.id });
                }}
                style={{ background: "#fff", padding: 8, margin: "6px 0", borderRadius: 6,
                         cursor: canEdit ? "grab" : "default" }}
              >
                {i.title}
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
