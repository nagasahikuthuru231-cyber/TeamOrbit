export async function api(path, { method = "GET", body, workspace } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Token ${token}`;
  if (workspace) headers["X-Workspace"] = workspace;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.detail === "string"
      ? data.detail
      : Object.values(data).flat().join(" ") || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
