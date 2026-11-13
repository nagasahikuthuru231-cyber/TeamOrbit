
import { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./login";
import KanbanBoard from "./KanbanBoard";

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const [ws, setWs] = useState(localStorage.getItem("ws") || "");
  const [projects, setProjects] = useState([]);
  const [boards, setBoards] = useState([]);

  const [boardId, setBoardId] = useState(null);
  const [activePage, setActivePage] = useState("overview");

  const [newWorkspace, setNewWorkspace] = useState("");
  const [newProject, setNewProject] = useState({
    name: "",
    key: "",
  });
  const [newBoard, setNewBoard] = useState({
    project: "",
    name: "",
  });
  const [invite, setInvite] = useState({
    email: "",
    role: "member",
  });

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const current = me?.workspaces.find((w) => w.slug === ws);
  const isAdmin = current && ["owner", "admin"].includes(current.role);

  // Workspace selection
  function pick(slug) {
    setWs(slug);
    localStorage.setItem("ws", slug);
    setBoardId(null);
    setActivePage("overview");
  }

  // Load logged-in user
  async function loadMe(prefer) {
    try {
      const data = await api("/auth/me/");
      setMe(data);

      const want = prefer || ws;

      const chosen = data.workspaces.some((w) => w.slug === want)
        ? want
        : data.workspaces[0]?.slug;

      if (chosen && chosen !== ws) {
        pick(chosen);
      }
    } catch {
      localStorage.removeItem("token");
      setMe(null);
    }

    setReady(true);
  }

  // Initial authentication
  useEffect(() => {
    if (localStorage.getItem("token")) {
      loadMe();
    } else {
      setReady(true);
    }
  }, []);

  // Accept workspace invitation
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("invite");

    if (!me || !token) return;

    api("/invitations/accept/", {
      method: "POST",
      body: { token },
    })
      .then((r) => {
        history.replaceState(null, "", location.pathname);
        setNotice(`Joined ${r.workspace} as ${r.role}.`);
        return loadMe(r.workspace);
      })
      .catch((e) => setError(e.message));
  }, [me?.id]);

  // Load projects and boards
  async function refresh() {
    if (!ws) {
      setProjects([]);
      setBoards([]);
      return;
    }

    try {
      const [p, b] = await Promise.all([
        api("/projects/", { workspace: ws }),
        api("/boards/", { workspace: ws }),
      ]);

      setProjects(p.results);
      setBoards(b.results);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [ws, me]);

  // Common API action handler
  async function act(fn, okMessage) {
    setError("");
    setNotice("");

    try {
      await fn();

      if (okMessage) {
        setNotice(okMessage);
      }

      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const submit = (fn, msg) => (e) => {
    e.preventDefault();
    act(fn, msg);
  };

  // Create workspace
  async function createWorkspace(e) {
    e.preventDefault();
    setError("");

    try {
      const w = await api("/workspaces/", {
        method: "POST",
        body: { name: newWorkspace },
      });

      setNewWorkspace("");
      await loadMe(w.slug);
      setNotice("Workspace created successfully.");
      setActivePage("overview");
    } catch (err) {
      setError(err.message);
    }
  }

  // Logout
  async function logout() {
    await api("/auth/logout/", { method: "POST" }).catch(() => {});

    localStorage.removeItem("token");
    localStorage.removeItem("ws");

    setMe(null);
    setBoardId(null);
    setActivePage("overview");
  }

  // Open a selected board
  function openBoard(id) {
    setBoardId(id);
    setActivePage("board");
  }

  // Loading screen
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">
            Loading ProjectFlow...
          </p>
        </div>
      </div>
    );
  }

  // Authentication screen
  if (!me) {
    return <Login onAuthed={() => loadMe()} />
  }

  const pageTitle =
    activePage === "overview"
      ? "Overview"
      : activePage === "projects"
        ? "Projects"
        : boards.find((b) => b.id === boardId)?.name || "Board";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen">

        {/* SIDEBAR */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-7 md:flex">

          {/* Logo */}
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-200">
              P
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                ProjectFlow
              </h1>
              <p className="text-xs text-slate-400">
                Workspace platform
              </p>
            </div>
          </div>

          {/* Workspace selector */}
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

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

          {/* Navigation */}
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Menu
          </p>

          <nav className="space-y-2">

            {/* Overview */}
            <button
              onClick={() => {
                setBoardId(null);
                setActivePage("overview");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                activePage === "overview"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="text-lg">▦</span>
              Overview
            </button>

            {/* Projects */}
            <button
              onClick={() => {
                setBoardId(null);
                setActivePage("projects");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                activePage === "projects"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="text-lg">◫</span>
              Projects
            </button>

            {/* Boards */}
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="mb-2 flex items-center gap-3 text-sm font-semibold text-slate-700">
                <span className="text-lg">▤</span>
                Boards
              </div>

              {boards.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  No boards yet
                </p>
              ) : (
                boards.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => openBoard(b.id)}
                    className={`mt-1 block w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                      activePage === "board" && boardId === b.id
                        ? "bg-indigo-100 font-semibold text-indigo-700"
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    {b.name}
                  </button>
                ))
              )}
            </div>
          </nav>

          {/* Sidebar bottom */}
          <div className="mt-auto rounded-2xl bg-indigo-50 p-4">
            <p className="text-sm font-bold text-indigo-900">
              Need a hand?
            </p>
            <p className="mt-1 text-xs leading-5 text-indigo-700">
              Organize your projects and collaborate with your team.
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="min-w-0 flex-1">

          {/* TOPBAR */}
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur md:px-9">
            <div>
              <p className="text-xs font-medium text-slate-400">
                {current?.name || "Workspace"}
              </p>

              <h2 className="text-lg font-bold text-slate-900">
                {pageTitle}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  {me.name || me.email}
                </p>

                <p className="text-xs capitalize text-slate-400">
                  {current?.role || "Member"}
                </p>
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

          {/* PAGE CONTENT */}
          <div className="mx-auto max-w-7xl px-5 py-8 md:px-9">

            {/* GLOBAL NOTIFICATIONS */}
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            {/* ===================================== */}
            {/* OVERVIEW PAGE */}
            {/* ===================================== */}

            {activePage === "overview" && (
              <div>

                <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="mb-2 text-sm font-medium text-indigo-600">
                      WORKSPACE OVERVIEW
                    </p>

                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                      Good to see you, {me.name?.split(" ")[0] || "there"}!
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                      Here's what's happening with your projects today.
                    </p>
                  </div>

                  <span className="w-fit rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                    ● Workspace active
                  </span>
                </div>

                {/* Dashboard statistics */}
                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">
                        Total projects
                      </span>
                      <span className="rounded-xl bg-indigo-50 p-3 text-xl text-indigo-600">
                        ▦
                      </span>
                    </div>

                    <p className="text-3xl font-bold text-slate-900">
                      {projects.length}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Projects in this workspace
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">
                        Total boards
                      </span>
                      <span className="rounded-xl bg-violet-50 p-3 text-xl text-violet-600">
                        ▤
                      </span>
                    </div>

                    <p className="text-3xl font-bold text-slate-900">
                      {boards.length}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Boards available
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">
                        Your role
                      </span>
                      <span className="rounded-xl bg-emerald-50 p-3 text-xl text-emerald-600">
                        ♙
                      </span>
                    </div>

                    <p className="text-2xl font-bold capitalize text-slate-900">
                      {current?.role || "Member"}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {current?.plan || "Workspace"} plan
                    </p>
                  </div>
                </div>

                {/* Create workspace */}
                <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <h3 className="font-bold text-slate-900">
                      Create a workspace
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Start a separate space for another team or project.
                    </p>
                  </div>

                  <form
                    onSubmit={createWorkspace}
                    className="flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      placeholder="Enter workspace name"
                      value={newWorkspace}
                      onChange={(e) => setNewWorkspace(e.target.value)}
                      required
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    />

                    <button className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700">
                      + Create workspace
                    </button>
                  </form>
                </section>

                {/* Overview summary */}
                <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5">
                    <h3 className="text-xl font-bold text-slate-900">
                      Quick overview
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      A summary of your workspace activity.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">
                        Projects created
                      </p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {projects.length}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">
                        Boards created
                      </p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {boards.length}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Invite teammate */}
                {isAdmin && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-2 font-bold text-slate-900">
                      Invite a teammate
                    </h3>

                    <p className="mb-4 text-sm text-slate-500">
                      Give your team access to this workspace.
                    </p>

                    <form
                      onSubmit={submit(async () => {
                        await api("/invitations/", {
                          method: "POST",
                          workspace: ws,
                          body: invite,
                        });

                        setInvite({
                          email: "",
                          role: "member",
                        });
                      }, "Invitation sent.")}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                    >
                      <input
                        type="email"
                        placeholder="Teammate email address"
                        value={invite.email}
                        required
                        onChange={(e) =>
                          setInvite({
                            ...invite,
                            email: e.target.value,
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400"
                      />

                      <select
                        value={invite.role}
                        onChange={(e) =>
                          setInvite({
                            ...invite,
                            role: e.target.value,
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400"
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

            {/* ===================================== */}
            {/* PROJECTS PAGE */}
            {/* ===================================== */}

            {activePage === "projects" && (
              <div>

                <div className="mb-8">
                  <p className="mb-2 text-sm font-medium text-indigo-600">
                    WORKSPACE MANAGEMENT
                  </p>

                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Projects
                  </h1>

                  <p className="mt-2 text-sm text-slate-500">
                    Manage your projects and their boards.
                  </p>
                </div>

                {/* Project list */}
                <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">
                        Your projects
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        All projects in this workspace.
                      </p>
                    </div>

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
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">
                            {p.key}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">
                              {p.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              Project · {p.key}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Create project and board */}
                {isAdmin && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

                    {/* Create project */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="mb-2 text-lg font-bold text-slate-900">
                        Create project
                      </h3>

                      <p className="mb-5 text-sm text-slate-500">
                        Add a new project to your workspace.
                      </p>

                      <form
                        onSubmit={submit(async () => {
                          await api("/projects/", {
                            method: "POST",
                            workspace: ws,
                            body: newProject,
                          });

                          setNewProject({
                            name: "",
                            key: "",
                          });
                        }, "Project created successfully.")}
                        className="space-y-3"
                      >
                        <input
                          placeholder="Project name"
                          value={newProject.name}
                          required
                          onChange={(e) =>
                            setNewProject({
                              ...newProject,
                              name: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                        />

                        <input
                          placeholder="Project key (e.g. PM)"
                          value={newProject.key}
                          required
                          maxLength={10}
                          onChange={(e) =>
                            setNewProject({
                              ...newProject,
                              key: e.target.value.toUpperCase(),
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                        />

                        <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
                          + Add project
                        </button>
                      </form>
                    </section>

                    {/* Create board */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="mb-2 text-lg font-bold text-slate-900">
                        Create board
                      </h3>

                      <p className="mb-5 text-sm text-slate-500">
                        Create a Kanban board for a project.
                      </p>

                      <form
                        onSubmit={submit(async () => {
                          await api("/boards/", {
                            method: "POST",
                            workspace: ws,
                            body: newBoard,
                          });

                          setNewBoard({
                            project: "",
                            name: "",
                          });
                        }, "Board created successfully.")}
                        className="space-y-3"
                      >
                        <select
                          required
                          value={newBoard.project}
                          onChange={(e) =>
                            setNewBoard({
                              ...newBoard,
                              project: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400"
                        >
                          <option value="">Select project</option>

                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <input
                          placeholder="Board name"
                          value={newBoard.name}
                          required
                          onChange={(e) =>
                            setNewBoard({
                              ...newBoard,
                              name: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                        />

                        <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
                          + Add board
                        </button>
                      </form>
                    </section>
                  </div>
                )}

                {/* Board list */}
                <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Your boards
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        Select a board to open its Kanban workspace.
                      </p>
                    </div>

                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-600">
                      {boards.length} boards
                    </span>
                  </div>

                  {boards.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">
                      No boards available yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {boards.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => openBoard(b.id)}
                          className="flex items-center justify-between rounded-xl border border-slate-100 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          <span className="font-semibold text-slate-800">
                            {b.name}
                          </span>

                          <span className="text-indigo-600">→</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ===================================== */}
            {/* BOARD PAGE */}
            {/* ===================================== */}

            {activePage === "board" && boardId && (
              <div>
                <div className="mb-8">
                  <p className="mb-2 text-sm font-medium text-indigo-600">
                    PROJECT WORKSPACE
                  </p>

                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    {boards.find((b) => b.id === boardId)?.name || "Kanban Board"}
                  </h1>

                  <p className="mt-2 text-sm text-slate-500">
                    Manage tasks and track your team's progress.
                  </p>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
                  <KanbanBoard
                    boardId={boardId}
                    workspace={ws}
                    canEdit={current ? current.role !== "viewer" : false}
                  />
                </section>
              </div>
            )}

            {/* No board selected */}
            {activePage === "board" && !boardId && (
              <div className="flex [min-h-400] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl text-indigo-600">
                  ▤
                </div>

                <h2 className="text-xl font-bold text-slate-900">
                  Select a board
                </h2>

                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Choose a board from the sidebar to start managing tasks.
                </p>

                <button
                  onClick={() => setActivePage("projects")}
                  className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  View projects
                </button>
              </div>
            )}

            {/* FOOTER */}
            <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
              ProjectFlow · Manage work. Collaborate better.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
