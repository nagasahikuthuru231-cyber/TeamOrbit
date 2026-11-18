import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import KanbanBoard from "./KanbanBoard";
import { api } from "./api";

vi.mock("./api", () => ({ api: vi.fn() }));

const project = { id: 1, key: "WEB", name: "Web", columns: ["To Do", "In Progress", "Done"] };
const members = {
  results: [
    { user_id: 3, email: "bob@x.com", name: "Bob", role: "member" },
    { user_id: 4, email: "cat@x.com", name: "", role: "admin" },
  ],
};

function issuesWith(overrides = {}) {
  return {
    results: [
      { id: 10, title: "Fix login", status: "To Do", position: 1, assignee: null, ...overrides },
      { id: 11, title: "Write docs", status: "Done", position: 1, assignee: 3 },
    ],
  };
}

function setupApi(issues = issuesWith()) {
  api.mockImplementation(async (path) => {
    if (path === "/projects/1/") return project;
    if (path === "/issues/?project=1") return issues;
    if (path === "/members/") return members;
    if (path === "/issues/10/move/" || path === "/issues/10/") return {};
    throw new Error(`unexpected call ${path}`);
  });
}

describe("KanbanBoard (project is the board)", () => {
  beforeEach(() => {
    api.mockReset();
    setupApi();
  });

  it("renders the project's columns with their issues", async () => {
    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);

    const todo = await screen.findByRole("region", { name: "To Do" });
    expect(within(todo).getByText("Fix login")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "In Progress" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Done" })).getByText("Write docs")).toBeInTheDocument();
  });

  it("moves an issue to another column with a drag and drop", async () => {
    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);

    fireEvent.dragStart(await screen.findByText("Fix login"));
    fireEvent.drop(screen.getByRole("region", { name: "Done" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/issues/10/move/", {
        method: "POST",
        workspace: "acme",
        body: { status: "Done", index: 1 },
      }),
    );
  });

  it("shows an empty assign icon for unassigned issues", async () => {
    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);
    expect(await screen.findByRole("button", { name: "Assign issue" })).toBeInTheDocument();
  });

  it("opens the assignee picker and assigns the chosen member", async () => {
    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign issue" }));
    expect(screen.getByRole("menu", { name: "Choose assignee" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Bob/ }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/issues/10/", {
        method: "PATCH",
        workspace: "acme",
        body: { assignee: 3 },
      }),
    );
  });

  it("can unassign an issue from the picker", async () => {
    setupApi(issuesWith({ assignee: 3 }));
    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);

    const card = (await screen.findByText("Fix login")).closest("article");
    fireEvent.click(within(card).getByRole("button", { name: /Assigned to bob@x.com/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unassigned" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/issues/10/", {
        method: "PATCH",
        workspace: "acme",
        body: { assignee: null },
      }),
    );
  });

  it("hides the assign icon and drag from viewers", async () => {
    render(<KanbanBoard projectId={1} workspace="acme" canEdit={false} />);

    const card = await screen.findByText("Fix login");
    expect(card.closest("article")).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: /Assign/ })).not.toBeInTheDocument();
  });

  it("shows the server error when a move fails", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/projects/1/") return project;
      if (path === "/issues/?project=1") return issuesWith();
      if (path === "/members/") return members;
      throw new Error("Invalid status for this project.");
    });

    render(<KanbanBoard projectId={1} workspace="acme" canEdit />);
    fireEvent.dragStart(await screen.findByText("Fix login"));
    fireEvent.drop(screen.getByRole("region", { name: "Done" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid status for this project.");
  });
});
