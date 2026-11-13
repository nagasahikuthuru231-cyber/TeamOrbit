
import AuthForm from "./AuthForm";

export default function Login({ onAuthed }) {
  return (
    <div className="min-h-screen w-full bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 p-3 sm:p-5 lg:p-8">

      <div className="mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-6xl items-center justify-center sm:min-h-[calc(100vh-40px)] lg:min-h-[calc(100vh-64px)]">

        <div className="grid w-full overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl lg:grid-cols-2">

          {/* Left Branding Section */}
          <div className="relative hidden min-h-150 flex-col justify-between overflow-hidden bg-linear-to-br from-indigo-600 to-violet-800 p-8 text-white sm:p-10 lg:flex lg:p-12">

            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />

            <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-indigo-300/20 blur-2xl" />

            <div className="relative z-10">
              <div className="mb-12 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
                  C
                </div>

                <span className="text-2xl font-bold">
                  CollabSpace
                </span>
              </div>

              <h1 className="max-w-sm text-4xl font-bold leading-tight xl:text-5xl">
                Work better.
                <br />
                Together.
              </h1>

              <p className="mt-6 max-w-sm text-base leading-7 text-indigo-100">
                Bring your team, projects, and ideas together in one place.
                Stay organized and make progress together.
              </p>
            </div>

            <div className="relative z-10 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-sm leading-6 text-indigo-50">
                "Great things happen when people work together."
              </p>

              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-indigo-200">
                Your workspace starts here
              </p>
            </div>
          </div>

          {/* Right Login Section */}
          <div className="flex min-w-0 flex-col justify-center px-5 py-10 sm:px-10 sm:py-12 md:px-14 lg:px-8 xl:px-14">

            {/* Mobile and Tablet Branding */}
            <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
                C
              </div>

              <span className="text-xl font-bold text-slate-800">
                CollabSpace
              </span>
            </div>

            <div className="mx-auto w-full max-w-md">

              <div className="mb-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 sm:text-sm">
                  Welcome to CollabSpace
                </p>

                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-2xl xl:text-3xl">
                  Welcome back!
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                  Sign in to access your workspace and continue where you left off.
                </p>
              </div>

              <AuthForm onAuthed={onAuthed} />

              <div className="mt-8 border-t border-slate-100 pt-6">
                <p className="text-center text-xs leading-5 text-slate-400">
                  By continuing, you agree to use CollabSpace responsibly.
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
