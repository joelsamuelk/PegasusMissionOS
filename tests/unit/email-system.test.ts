import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPegasusEmail } from "@/lib/email/render";
import {
  accountInvitationEmail,
  approvedOutreachEmail,
  personalEmail,
} from "@/lib/email/templates";
import {
  EmailDeliveryNotConfiguredError,
  getSystemEmailProvider,
  ResendSystemEmailProvider,
} from "@/server/communications/system-email";

afterEach(() => vi.unstubAllGlobals());

const signature = {
  name: "Joël Samuel Kapepula",
  role: "Founder",
  organisation: "Pegasus Information Studio",
  email: "joel@pegasus-studio.co",
  phone: "+44 7770 000000",
  website: "pegasus-studio.co",
  location: "Exeter, Devon, UK",
};

describe("Pegasus email system", () => {
  it("renders accessible HTML and a useful plain-text alternative", () => {
    const email = accountInvitationEmail({
      name: "Joel",
      inviteUrl: "https://control.pegasus-studio.co/invite",
      expiresIn: "in 24 hours",
    });
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain('role="presentation"');
    expect(email.html).toContain("Accept invitation");
    expect(email.text).toContain("https://control.pegasus-studio.co/invite");
  });

  it("uses live escaped text for personal signatures", () => {
    const email = personalEmail({
      subject: "A quick note",
      preheader: "Following up",
      recipientName: "Amina",
      paragraphs: ["Hello <script>alert(1)</script>"],
      signature,
    });
    expect(email.html).toContain("Joël Samuel Kapepula");
    expect(email.html).toContain("Pegasus Information Studio");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("joel@pegasus-studio.co");
  });

  it("requires compliance details for outreach", () => {
    expect(() =>
      renderPegasusEmail({
        kind: "outreach",
        subject: "Hello",
        preheader: "Hello",
        title: "Hello",
        sections: [{ paragraphs: ["Message"] }],
      }),
    ).toThrow("requires compliance");
  });

  it("renders unsubscribe information and the personal signature for approved outreach", () => {
    const email = approvedOutreachEmail({
      subject: "Introduction",
      preheader: "A relevant introduction",
      recipientName: "Amina",
      paragraphs: ["We thought this may be relevant."],
      signature,
      compliance: {
        organisationName: "Pegasus Information Studio",
        postalAddress: "Exeter, Devon, UK",
        unsubscribeUrl: "https://mission.pegasus-studio.co/unsubscribe/abc",
        contactSource: "Contact details sourced from your organisation website.",
      },
    });
    expect(email.html).toContain("Unsubscribe from outreach");
    expect(email.html).toContain("Joël Samuel Kapepula");
    expect(email.text).toContain("Unsubscribe:");
  });

  it("rejects unsafe link protocols", () => {
    expect(() =>
      accountInvitationEmail({
        name: "Joel",
        inviteUrl: "javascript:alert(1)",
        expiresIn: "soon",
      }),
    ).toThrow("HTTP or HTTPS");
  });

  it("fails closed when no delivery provider is configured", async () => {
    await expect(
      getSystemEmailProvider().send({
        to: ["joel@example.com"],
        message: accountInvitationEmail({
          name: "Joel",
          inviteUrl: "https://example.com",
          expiresIn: "soon",
        }),
        idempotencyKey: "invite-1",
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryNotConfiguredError);
  });

  it("delivers approved messages through Resend with an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ResendSystemEmailProvider(
      "re_test",
      "Joël at Pegasus <joel@pegasus-studio.co>",
    );
    const result = await provider.send({
      to: ["amina@example.org"],
      message: personalEmail({
        subject: "Hello",
        preheader: "Hello",
        recipientName: "Amina",
        paragraphs: ["A relevant note."],
        signature,
      }),
      approvedByInternalUserId: "founder-1",
      idempotencyKey: "outreach-1",
    });
    expect(result.providerMessageId).toBe("email_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "outreach-1" }),
      }),
    );
  });

  it("refuses Resend delivery without a human approver", async () => {
    const provider = new ResendSystemEmailProvider("re_test", "sender@example.com");
    await expect(
      provider.send({
        to: ["person@example.org"],
        message: accountInvitationEmail({
          name: "Amina",
          inviteUrl: "https://example.com/invite",
          expiresIn: "soon",
        }),
        idempotencyKey: "unapproved-1",
      }),
    ).rejects.toThrow("human approver");
  });
});
