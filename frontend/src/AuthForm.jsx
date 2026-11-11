import { useState } from "react";
import { api } from "./api";

export default function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");

  const set = key => e => {
    const value = e.target.value;
    setForm(f => ({ ...f, [key]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api(`/auth/${mode}/`, { method: "POST", body: form });
      localStorage.setItem("token", data.token);
      onAuthed();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 320, margin: "48px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
      {mode === "signup" && (
        <input placeholder="Name" value={form.name} onChange={set("name")} style={{ display: "block", width: "100%", marginBottom: 8 }} />
      )}
      <input placeholder="Email" type="email" required value={form.email} onChange={set("email")}
             style={{ display: "block", width: "100%", marginBottom: 8 }} />
      <input placeholder="Password" type="password" required value={form.password} onChange={set("password")}
             style={{ display: "block", width: "100%", marginBottom: 8 }} />
      <button type="submit">{mode === "login" ? "Log in" : "Sign up"}</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        <a href="#" onClick={e => { e.preventDefault(); setError(""); setMode(mode === "login" ? "signup" : "login"); }}>
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </a>
      </p>
    </form>
  );
}
