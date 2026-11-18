import Link from "next/link";

export function AppHeader({ email }: { email?: string | null }) {
  return (
    <div className="topbar">
      <Link className="brand" href="/dashboard">
        SaaSDash
      </Link>
      <nav className="nav">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/upload">Data</Link>
        {email && <span className="muted small">{email}</span>}
        <form action="/auth/signout" method="post">
          <button className="linkbtn" type="submit">
            Sign out
          </button>
        </form>
      </nav>
    </div>
  );
}
