import type { ReactNode } from "react";
import { Dialog } from "./Dialog.tsx";

export type LegalPage = "privacy" | "terms" | "credits";

const REPO = "https://github.com/LokeshKvms/uno";
const UPDATED = "28 September 2026";

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const PAGES: Record<LegalPage, { title: string; sections: { heading: string; body: ReactNode }[] }> = {
  privacy: {
    title: "Privacy",
    sections: [
      {
        heading: "The short version",
        body: "No accounts, no ads, no analytics and no trackers. The game only keeps what it needs to run your table, and deletes it when the table is done.",
      },
      {
        heading: "What we store",
        body: "The name and color you pick, your seat and cards, your table's game log, and its last 100 chat messages. Chat and names are visible to everyone at your table, including spectators.",
      },
      {
        heading: "How long",
        body: "A table is deleted as soon as everyone leaves it, or automatically once it sits idle: 30 minutes for a game in progress, up to 2 hours for a lobby.",
      },
      {
        heading: "Cookies and your browser",
        body: "One cookie, uno_sid, holds a random ID so a refresh or a dropped connection gives you your seat back. It lasts 60 days and is used for nothing else. Your name, color and sound settings are saved in your browser so you don't have to retype them.",
      },
      {
        heading: "Where it lives",
        body: "The app runs on Render in Singapore and tables are saved in a Turso database in Mumbai. Like any website, the host keeps short-lived request logs that include IP addresses, used only to keep the service running.",
      },
      {
        heading: "Questions or removal",
        body: (
          <>
            Leaving a table removes you from it. For anything else, <Out href={`${REPO}/issues`}>open an issue on GitHub</Out>.
          </>
        ),
      },
    ],
  },
  terms: {
    title: "Terms",
    sections: [
      {
        heading: "Just for fun",
        body: "This is a free hobby project, provided as is with no guarantees. Tables can reset, and the site can change or go offline at any time.",
      },
      {
        heading: "Be decent",
        body: "Keep names and chat friendly. Nothing hateful, harassing or illegal. Hosts can remove players from their lobby.",
      },
      {
        heading: "Play fair",
        body: "No bots, scripts, spam, or attempts to break, overload or get around the limits of the service.",
      },
      {
        heading: "Not official",
        body: "UNO is a trademark of Mattel. This is an unofficial fan project and is not affiliated with, sponsored or endorsed by Mattel.",
      },
      {
        heading: "Agreement",
        body: "By playing you accept these terms and the privacy note.",
      },
    ],
  },
  credits: {
    title: "Credits",
    sections: [
      {
        heading: "Made by Loki",
        body: (
          <>
            Built for friends who want a quick game without the sign-ups. The source is on <Out href={REPO}>GitHub</Out>.
          </>
        ),
      },
      {
        heading: "Cards and sound",
        body: "The card faces, logo and sound effects are original work, drawn and synthesized for this project in the style of the classic card game.",
      },
      {
        heading: "Trademark",
        body: "UNO® is a registered trademark of Mattel, Inc. This free, non-commercial fan project is not affiliated with, sponsored or endorsed by Mattel.",
      },
      {
        heading: "Type and icons",
        body: (
          <>
            <Out href="https://github.com/Omnibus-Type/Archivo">Archivo</Out> by Omnibus-Type, under the SIL Open Font License 1.1.{" "}
            <Out href="https://phosphoricons.com">Phosphor Icons</Out>, under the MIT License.
          </>
        ),
      },
      {
        heading: "Open source",
        body: "React, Motion, Radix UI, Socket.IO, Fastify, Zustand, Zod, libSQL and qrcode, each under its own open-source license.",
      },
    ],
  },
};

export function LegalDialog({ page, onClose }: { page: LegalPage | null; onClose: () => void }) {
  const content = page ? PAGES[page] : null;
  return (
    <Dialog open={!!content} onOpenChange={(open) => !open && onClose()} title={content?.title ?? ""} className="legal-dialog">
      {content && (
        <>
          <div className="legal-sections">
            {content.sections.map((s) => (
              <section key={s.heading}>
                <h3>{s.heading}</h3>
                <p>{s.body}</p>
              </section>
            ))}
          </div>
          <p className="legal-updated">Last updated {UPDATED}</p>
        </>
      )}
    </Dialog>
  );
}
