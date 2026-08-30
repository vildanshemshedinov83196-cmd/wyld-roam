"use client";

import Link from "next/link";
import {
  usePathname,
} from "next/navigation";

type BottomNavProps = {
  isOwner?: boolean;
};

export function RoamBackground() {
  return (
    <>
      <div className="roam-orb roam-orb-one" />
      <div className="roam-orb roam-orb-two" />
      <div className="roam-grid" />
    </>
  );
}

export function Brand() {
  return (
    <div className="roam-brand">
      <span className="roam-brand-mark">
        W
      </span>

      <span>WYLD ROAM</span>
    </div>
  );
}

export function BottomNav({
  isOwner = false,
}: BottomNavProps) {
  const pathname =
    usePathname();

  const homeActive =
    pathname === "/" ||
    pathname.startsWith(
      "/plans"
    ) ||
    pathname.startsWith(
      "/checkout"
    ) ||
    pathname.startsWith(
      "/payment"
    );

  const esimActive =
    pathname.startsWith(
      "/my-esims"
    );

  const supportActive =
    pathname.startsWith(
      "/support"
    );

  const adminActive =
    pathname.startsWith(
      "/admin"
    );

  return (
    <nav className="roam-bottom-nav">
      <Link
        href="/"
        className={
          homeActive
            ? "roam-nav-item roam-nav-item-active"
            : "roam-nav-item"
        }
      >
        <span className="roam-nav-icon">
          ◉
        </span>
        <span>eSIM</span>
      </Link>

      <Link
        href="/my-esims"
        className={
          esimActive
            ? "roam-nav-item roam-nav-item-active"
            : "roam-nav-item"
        }
      >
        <span className="roam-nav-icon">
          ◇
        </span>
        <span>Мои eSIM</span>
      </Link>

      <Link
        href="/support"
        className={
          supportActive
            ? "roam-nav-item roam-nav-item-active"
            : "roam-nav-item"
        }
      >
        <span className="roam-nav-icon">
          ?
        </span>
        <span>Помощь</span>
      </Link>

      {isOwner && (
        <Link
          href="/admin"
          className={
            adminActive
              ? "roam-nav-item roam-nav-item-active"
              : "roam-nav-item"
          }
        >
          <span className="roam-nav-icon">
            ▥
          </span>
          <span>Статистика</span>
        </Link>
      )}
    </nav>
  );
}

export function BackButton({
  href,
}: {
  href?: string;
}) {
  if (href) {
    return (
      <Link
        href={href}
        className="roam-back"
      >
        ←
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        window.history.back()
      }
      className="roam-back"
    >
      ←
    </button>
  );
}
