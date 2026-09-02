import { describe, expect, it } from "vitest";
import { absoluteUrl, classifyRecipient, renderEmailHtml, type QueuedEmail } from "./email";

function row(overrides: Partial<QueuedEmail> = {}): QueuedEmail {
  return {
    id: "1",
    recipient_email: "student@example.com",
    recipient_player_name: "Sam",
    event_type: "crown_taken",
    subject: "Your AceDecks crown was taken",
    body: "Alex beat your score on Photosynthesis.",
    action_href: "/battle/abc",
    ...overrides,
  };
}

describe("classifyRecipient", () => {
  it("passes a real address through", () => {
    expect(classifyRecipient(row())).toBeNull();
  });

  it("permanently fails a row with no address", () => {
    // A battle is playable signed out, so crown_taken rows can carry a
    // display name and no address. There is nobody to email, ever -- it must
    // not be retried on every cron run forever.
    const outcome = classifyRecipient(row({ recipient_email: null }));
    expect(outcome).toMatchObject({ status: "failed" });
  });

  it("permanently fails obvious junk without spending a request", () => {
    for (const bad of ["", "   ", "not-an-email", "a@b", "a@b.", "@example.com"]) {
      expect(classifyRecipient(row({ recipient_email: bad })), bad).toMatchObject({
        status: "failed",
      });
    }
  });
});

describe("renderEmailHtml", () => {
  it("escapes the body, because a display name is attacker-controlled", () => {
    // The body is built from a player-chosen name. Unescaped, every
    // notification would be an HTML injection into someone else's inbox.
    const html = renderEmailHtml(
      row({ body: '<img src=x onerror="alert(1)"> beat your score' })
    );
    // The property that matters is that no tag and no attribute can form:
    // the angle brackets and quotes are escaped, so what is left is inert
    // text that happens to read like markup.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;alert(1)&quot;");
    expect(html).not.toContain('onerror="');
  });

  it("escapes the action href too", () => {
    const html = renderEmailHtml(row({ action_href: '/battle/"onmouseover="x' }));
    expect(html).not.toContain('"onmouseover="x"');
    expect(html).toContain("&quot;");
  });

  it("keeps paragraph breaks", () => {
    const html = renderEmailHtml(row({ body: "First line.\n\nSecond line." }));
    expect(html.match(/<p style="margin:0 0 16px">/g)).toHaveLength(2);
  });

  it("omits the button when there is nowhere to go", () => {
    expect(renderEmailHtml(row({ action_href: null }))).not.toContain("Open AceDecks");
  });
});

describe("absoluteUrl", () => {
  it("makes an app path absolute", () => {
    expect(absoluteUrl("/battle/abc")).toMatch(/^https?:\/\/.+\/battle\/abc$/);
  });

  it("leaves an already-absolute url alone", () => {
    expect(absoluteUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("tolerates a path with no leading slash", () => {
    expect(absoluteUrl("battle/abc")).toMatch(/\/battle\/abc$/);
  });
});
