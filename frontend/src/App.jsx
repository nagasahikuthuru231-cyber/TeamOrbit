import { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./login";
import KanbanBoard from "./KanbanBoard";

const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white";
const primaryBtn =
  "rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700";
const dangerBtn =
  "rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50";

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const [ws, setWs] = useState(localStorage.getItem("ws") || "");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [activePage, setActivePage] = useState("overview"); // overview | projects | project

  const [newWorkspace, setNewWorkspace] = useState("");
  const [newProject, setNewProject] = useState({ name: "", key: "" });
  const [invite, setInvite] = useState({ email: "", role: "member" });

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const current = me?.workspaces.find((w) => w.slug === ws);
  const isAdmin = current && ["owner", "admin"].includes(current.role);
  const canEdit = current ? current.role !== "viewer" : false;
  const project = projects.find((p) => p.id === projectId);

  function pick(slug) {
    setWs(slug);
    localStorage.setItem("ws", slug);
    setProjectId(null);
    setActivePage("overview");
  }

  async function loadMe(prefer) {
    try {
      const data = await api("/auth/me/");
      setMe(data);
      const want = prefer || ws;
      const chosen = data.workspaces.some((w) => w.slug === want) ? want : data.workspaces[0]?.slug;
      if (chosen && chosen !== ws) pick(chosen);
    } catch {
      localStorage.removeItem("token");
      setMe(null);
    }
    setReady(true);
  }

  useEffect(() => {
    if (localStorage.getItem("token")) loadMe();
    else setReady(true);
  }, []);

  // Accept workspace invitation
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("invite");
    if (!me || !token) return;
    api("/invitations/accept/", { method: "POST", body: { token } })
      .then((r) => {
        history.replaceState(null, "", location.pathname);
        setNotice(`Joined ${r.workspace} as ${r.role}.`);
        return loadMe(r.workspace);
      })
      .catch((e) => setError(e.message));
  }, [me?.id]);

  // Return from Stripe Checkout
  useEffect(() => {
    if (!me || new URLSearchParams(location.search).get("billing") !== "success") return;
    history.replaceState(null, "", location.pathname);
    setNotice("Thanks! Your subscription is being activated.");
    loadMe();
  }, [me?.id]);

  async function refresh() {
    if (!ws) {
      setProjects([]);
      return;
    }
    try {
      const p = await api("/projects/", { workspace: ws });
      setProjects(p.results);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [ws, me]);

  async function run(fn, okMessage) {
    setError("");
    setNotice("");
    try {
      await fn();
      if (okMessage) setNotice(okMessage);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createWorkspace(e) {
    e.preventDefault();
    setError("");
    try {
      const w = await api("/workspaces/", { method: "POST", body: { name: newWorkspace } });
      setNewWorkspace("");
      await loadMe(w.slug);
      setNotice("Workspace created successfully.");
      setActivePage("overview");
    } catch (err) {
      setError(err.message);
    }
  }

  async function createProject(e) {
    e.preventDefault();
    run(async () => {
      await api("/projects/", { method: "POST", workspace: ws, body: newProject });
      setNewProject({ name: "", key: "" });
    }, "Project created.");
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete "${p.name}" and all of its issues? This cannot be undone.`)) return;
    run(async () => {
      await api(`/projects/${p.id}/`, { method: "DELETE", workspace: ws });
      if (p.id === projectId) {
        setProjectId(null);
        setActivePage("projects");
      }
    }, `Deleted "${p.name}".`);
  }

  async function upgrade() {
    setError("");
    try {
      const { url } = await api("/billing/checkout/", { method: "POST", workspace: ws });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
    }
  }

  async function logout() {
    await api("/auth/logout/", { method: "POST" }).catch(() => {});
    localStorage.removeItem("token");
    localStorage.removeItem("ws");
    setMe(null);
    setProjectId(null);
    setActivePage("overview");
  }

  function openProject(id) {
    setProjectId(id);
    setActivePage("project");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Loading TeamOrbit...</p>
        </div>
      </div>
    );
  }

  if (!me) return <Login onAuthed={() => loadMe()} />;

  const navBtn = (active) =>
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
      active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
    }`;

  const pageTitle =
    activePage === "overview" ? "Overview" : activePage === "projects" ? "Projects" : project?.name || "Project";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-7 md:flex">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-200">
              T
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">TeamOrbit</h1>
              <p className="text-xs text-slate-400">Workspace platform</p>
            </div>
          </div>

          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
          {me.workspaces.length > 0 && (
            <select
              value={ws}
              onChange={(e) => pick(e.target.value)}
              className="mb-8 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium outline-none focus:border-indigo-400"
            >
              {me.workspaces.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
          )}

          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Menu</p>
          <nav className="space-y-2">
            <button onClick={() => setActivePage("overview")} className={navBtn(activePage === "overview")}>
              <span className="text-lg">▦</span> Overview
            </button>
            <button onClick={() => setActivePage("projects")} className={navBtn(activePage === "projects")}>
              <span className="text-lg">◫</span> Projects
            </button>

            {/* Each project is its own board */}
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              {projects.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-400">No projects yet</p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openProject(p.id)}
                    className={`mt-1 block w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                      activePage === "project" && projectId === p.id
                        ? "bg-indigo-100 font-semibold text-indigo-700"
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span className="mr-1 font-bold">{p.key}</span> {p.name}
                  </button>
                ))
              )}
            </div>
          </nav>
        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur md:px-9">
            <div>
              <p className="text-xs font-medium text-slate-400">{current?.name || "Workspace"}</p>
              <h2 className="text-lg font-bold text-slate-900">{pageTitle}</h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-800">{me.name || me.email}</p>
                <p className="text-xs capitalize text-slate-400">{current?.role || "Member"}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                {(me.name || me.email || "U").charAt(0).toUpperCase()}
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                Log out
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-5 py-8 md:px-9">
            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            {/* OVERVIEW */}
            {activePage === "overview" && (
              <div>
                <div className="mb-8">
                  <p className="mb-2 text-sm font-medium text-indigo-600">WORKSPACE OVERVIEW</p>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Good to see you, {me.name?.split(" ")[0] || "there"}!
                  </h1>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className={card}>
                    <span className="text-sm font-medium text-slate-500">Projects</span>
                    <p className="mt-4 text-3xl font-bold text-slate-900">{projects.length}</p>
                  </div>
                  <div className={card}>
                    <span className="text-sm font-medium text-slate-500">Your role</span>
                    <p className="mt-4 text-2xl font-bold capitalize text-slate-900">{current?.role || "Member"}</p>
                  </div>
                  <div className={card}>
                    <span className="text-sm font-medium text-slate-500">Plan</span>
                    <p className="mt-4 text-2xl font-bold capitalize text-slate-900">{current?.plan || "free"}</p>
                  </div>
                </div>

                {current?.role === "owner" && (
                  <section className={`mb-8 ${card}`}>
                    <h3 className="mb-2 font-bold text-slate-900">Billing</h3>
                    <p className="mb-4 text-sm text-slate-500">
                      Upgrade to raise the project and member limits.
                    </p>
                    {current.plan === "free" ? (
                      <button onClick={upgrade} className={primaryBtn}>Upgrade to Pro</button>
                    ) : (
                      <p className="text-sm font-medium text-emerald-700">Pro plan active.</p>
                    )}
                  </section>
                )}

                <section className={`mb-8 ${card}`}>
                  <h3 className="mb-1 font-bold text-slate-900">Create a workspace</h3>
                  <p className="mb-4 text-sm text-slate-500">Start a separate space for another team.</p>
                  <form onSubmit={createWorkspace} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      placeholder="Enter workspace name"
                      value={newWorkspace}
                      onChange={(e) => setNewWorkspace(e.target.value)}
                      required
                      className={`min-w-0 flex-1 ${field}`}
                    />
                    <button className={primaryBtn}>+ Create workspace</button>
                  </form>
                </section>

                {isAdmin && (
                  <section className={card}>
                    <h3 className="mb-1 font-bold text-slate-900">Invite a teammate</h3>
                    <p className="mb-4 text-sm text-slate-500">Give your team access to this workspace.</p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          await api("/invitations/", { method: "POST", workspace: ws, body: invite });
                          setInvite({ email: "", role: "member" });
                        }, "Invitation sent.");
                      }}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                    >
                      <input
                        type="email"
                        placeholder="Teammate email address"
                        value={invite.email}
                        required
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                        className={field}
                      />
                      <select
                        value={invite.role}
                        onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                        className={field}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                        Send invitation →
                      </button>
                    </form>
                  </section>
                )}
              </div>
            )}

            {/* PROJECTS */}
            {activePage === "projects" && (
              <div>
                <section className={`mb-8 ${card}`}>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Your projects</h3>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                      {projects.length} projects
                    </span>
                  </div>

                  {projects.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">
                      No projects yet. Create your first project below.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {projects.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-4 rounded-xl border border-slate-100 p-5 transition hover:border-indigo-200 hover:shadow-sm"
                        >
                          <button onClick={() => openProject(p.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">
                              {p.key}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800">{p.name}</p>
                              <p className="mt-1 text-xs text-slate-400">{p.columns.join(" → ")}</p>
                            </div>
                          </button>
                          {isAdmin && (
                            <button onClick={() => deleteProject(p)} className={dangerBtn}>
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {isAdmin && (
                  <section className={card}>
                    <h3 className="mb-1 text-lg font-bold text-slate-900">Create project</h3>
                    <p className="mb-5 text-sm text-slate-500">
                      Each project is its own board, with the default columns To Do, In Progress, Done.
                    </p>
                    <form onSubmit={createProject} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        placeholder="Project name"
                        value={newProject.name}
                        required
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        className={`sm:col-span-1 ${field}`}
                      />
                      <input
                        placeholder="Key (e.g. WEB)"
                        value={newProject.key}
                        required
                        maxLength={10}
                        onChange={(e) => setNewProject({ ...newProject, key: e.target.value.toUpperCase() })}
                        className={field}
                      />
                      <button className={primaryBtn}>+ Add project</button>
                    </form>
                  </section>
                )}
              </div>
            )}

            {/* PROJECT BOARD */}
            {activePage === "project" && project && (
              <div>
                <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="mb-2 text-sm font-medium text-indigo-600">PROJECT {project.key}</p>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">{project.name}</h1>
                  </div>
                  {isAdmin && (
                    <button onClick={() => deleteProject(project)} className={dangerBtn}>
                      Delete project
                    </button>
                  )}
                </div>

                <section className={card}>
                  <KanbanBoard key={project.id} projectId={project.id} workspace={ws} canEdit={canEdit} />
                </section>
              </div>
            )}

            {activePage === "project" && !project && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="text-sm text-slate-500">Select a project from the sidebar.</p>
              </div>
            )}

            <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
              TeamOrbit · Manage work. Collaborate better.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
