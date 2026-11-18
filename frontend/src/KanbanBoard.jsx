import { useEffect, useState } from "react";
import { api } from "./api";

const byPosition = (a, b) => a.position - b.position || a.id - b.id;
const initials = (m) => (m.name || m.email || "?").trim().charAt(0).toUpperCase();

function UserIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export default function KanbanBoard({ projectId, workspace, canEdit }) {
  const [project, setProject] = useState(null);
  const [issues, setIssues] = useState([]);
  const [members, setMembers] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { status, beforeId }; beforeId null means "append"
  const [pickerFor, setPickerFor] = useState(null); // issue id whose assignee picker is open
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [p, i, m] = await Promise.all([
        api(`/projects/${projectId}/`, { workspace }),
        api(`/issues/?project=${projectId}`, { workspace }),
        api("/members/", { workspace }),
      ]);
      setProject(p);
      setIssues(i.results);
      setMembers(m.results);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setProject(null);
    load();
  }, [projectId, workspace]);

  async function drop(status) {
    const id = dragId;
    const target = over;
    setDragId(null);
    setOver(null);
    if (id == null || (target && target.beforeId === id)) return;

    // Index among the other issues in the target column, which is what the server expects.
    const others = issues.filter((i) => i.status === status && i.id !== id).sort(byPosition);
    const at =
      target && target.status === status && target.beforeId != null
        ? others.findIndex((i) => i.id === target.beforeId)
        : -1;
    const index = at === -1 ? others.length : at;

    const snapshot = issues;
    setIssues((cur) => cur.map((i) => (i.id === id ? { ...i, status } : i)));
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
      await api("/issues/", {
        method: "POST",
        workspace,
        body: { project: projectId, title },
      });
      setTitle("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function assign(issueId, userId) {
    setPickerFor(null);
    setError("");
    try {
      await api(`/issues/${issueId}/`, { method: "PATCH", workspace, body: { assignee: userId } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!project) {
    return <p className="text-sm text-slate-500">{error || "Loading board…"}</p>;
  }

  const memberById = new Map(members.map((m) => [m.user_id, m]));

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {canEdit && (
        <form onSubmit={addIssue} className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            placeholder="New issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            + Add issue
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {project.columns.map((col) => (
          <section
            key={col}
            aria-label={col}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOver({ status: col, beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(col);
            }}
            className="flex min-h-[300px] flex-col rounded-2xl bg-slate-100 p-3"
          >
            <h4 className="mb-3 px-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {col}
              <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-slate-400">
                {issues.filter((i) => i.status === col).length}
              </span>
            </h4>

            {issues
              .filter((i) => i.status === col)
              .sort(byPosition)
              .map((i) => {
                const assignee = memberById.get(i.assignee);
                return (
                  <article
                    key={i.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(i.id)}
                    onDragOver={(e) => {
                      if (!canEdit) return;
                      e.preventDefault();
                      e.stopPropagation(); // keep the column handler from resetting the insert point
                      setOver({ status: col, beforeId: i.id });
                    }}
                    className={`relative mb-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 shadow-sm transition ${
                      canEdit ? "cursor-grab hover:border-indigo-300 hover:shadow" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words">{i.title}</span>

                      {canEdit ? (
                        <button
                          type="button"
                          draggable={false}
                          aria-label={assignee ? `Assigned to ${assignee.email}. Change assignee` : "Assign issue"}
                          title={assignee ? assignee.email : "Assign"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickerFor(pickerFor === i.id ? null : i.id);
                          }}
                          className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
                        >
                          {assignee ? (
                            <span className="text-xs font-bold text-indigo-700">{initials(assignee)}</span>
                          ) : (
                            <UserIcon />
                          )}
                        </button>
                      ) : assignee ? (
                        <span title={assignee.email} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                          {initials(assignee)}
                        </span>
                      ) : null}
                    </div>

                    {pickerFor === i.id && (
                      <div
                        role="menu"
                        aria-label="Choose assignee"
                        className="absolute right-2 top-10 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
                      >
                        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Assign to
                        </p>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            assign(i.id, null);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                        >
                          Unassigned
                        </button>
                        {members.map((m) => (
                          <button
                            key={m.user_id}
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              assign(i.id, m.user_id);
                            }}
                            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
                              i.assignee === m.user_id ? "font-semibold text-indigo-700" : "text-slate-700"
                            }`}
                          >
                            {m.name || m.email}
                            <span className="ml-1 text-xs text-slate-400">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
          </section>
        ))}
      </div>
    </div>
  );
}
