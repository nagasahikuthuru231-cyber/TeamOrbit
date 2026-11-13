
import { useState } from "react";
import { api } from "./api";

export default function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api(`/auth/${mode}/`, {
        method: "POST",
        body: form,
      });

      localStorage.setItem("token", data.token);
      onAuthed();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 autofill:shadow-[inset_0_0_0_100px_white]";

  return (
    <form onSubmit={submit} className="w-full space-y-5">

      {/* Form Heading */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-slate-800">
          {mode === "login" ? "Log in to your account" : "Create your account"}
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Enter your details to continue."
            : "Fill in your details to get started."}
        </p>
      </div>

      {/* Name Field */}
      {mode === "signup" && (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Full name
          </label>

          <input
            type="text"
            placeholder="Enter your name"
            autoComplete="name"
            required
            value={form.name}
            onChange={set("name")}
            className={inputClass}
          />
        </div>
      )}

      {/* Email Field */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Email address
        </label>

        <input
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
          className={inputClass}
        />
      </div>

      {/* Password Field */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Password
        </label>

        <input
          type="password"
          placeholder="Enter your password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          value={form.password}
          onChange={set("password")}
          className={inputClass}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "Please wait..."
          : mode === "login"
            ? "Log in"
            : "Create account"}
      </button>

      {/* Login / Signup Switch */}
      <div className="pt-2 text-center">
        <p className="text-sm text-slate-500">
          {mode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}

          <button
            type="button"
            onClick={() => {
              setError("");
              setMode(mode === "login" ? "signup" : "login");
            }}
            className="ml-1 font-semibold text-indigo-600 transition-colors hover:text-indigo-800"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </form>
  );
}
