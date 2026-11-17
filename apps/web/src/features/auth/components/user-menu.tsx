import Link from "next/link";
import { roleOf } from "@examinus/domain/roles";
import { logout } from "@/features/auth/actions";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth/dal";

function SignOut() {
  return (
    <form action={logout}>
      <SignOutButton />
    </form>
  );
}

export async function UserMenu() {
  const user = await getCurrentUser();
  const initials = user.name
    .replace(/^(Prof|Dr|Mr|Ms|Mrs)\.?\s+/i, "")
    .slice(0, 2)
    .toUpperCase();
  const who = (
    <>
      <span
        title={`${user.name} · ${user.email}`}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1 rail:sr-only">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
    </>
  );
  const row = "flex min-w-0 flex-1 items-center gap-3 rail:flex-col rail:gap-2";
  const role = roleOf(user);
  const profileHref = role === "student" ? "/student/profile" : role === "teacher" ? "/teacher/profile" : null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3 rail:flex-col rail:gap-2 rail:border-0 rail:p-0">
      {/* Students open Student Information and teachers their profile from their name. */}
      {profileHref ? (
        <Link href={profileHref} title="Your profile" className={`${row} rounded-md hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary`}>
          {who}
        </Link>
      ) : (
        <div className={row}>{who}</div>
      )}
      <SignOut />
    </div>
  );
}
