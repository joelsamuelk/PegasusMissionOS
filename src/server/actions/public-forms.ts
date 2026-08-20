"use server";

/**
 * The public form path. **@public-action**
 *
 * These two actions hold no capability, because a member of the public has
 * none. They are the only unauthenticated surface in the customer product, and
 * they live in their own file so the data-boundary test's `@public-action`
 * exemption covers exactly them — an exemption on the main forms module would
 * have silently covered six authorised actions as well, and the next one added
 * after that.
 *
 * What protects them, in place of authorisation:
 *
 * 1. **Reach.** `publicForms` can only resolve a form that is `public`, `open`
 *    and published, can read only that form's fields, and can reach no other
 *    table. A bug here exposes questions somebody deliberately put on the
 *    internet.
 * 2. **Rate limit.** Per slug and per coarse source token, defaulting to the
 *    form's own setting. In-process and per-instance, which is honest for a
 *    surface whose failure mode is a review queue somebody has to clear.
 * 3. **Nothing takes effect.** A public submission always lands as
 *    `awaiting_review`, so it changes nothing in the graph until a person with
 *    `forms:review` decides what it becomes.
 */

import type { ClaimValue, Form, FormField } from "@/types/domain";
import { rateLimit } from "@/server/rate-limit";
import { getRepository } from "@/server/data";

export interface PublicFormResult {
  ok: boolean;
  form?: Pick<Form, "id" | "name" | "description" | "confirmationMessage">;
  fields?: FormField[];
  error?: string;
}

export async function loadPublicForm(slug: string): Promise<PublicFormResult> {
  const repo = getRepository();
  const resolved = await repo.publicForms.resolveBySlug(slug);
  if (!resolved) return { ok: false, error: "That form is not available." };

  return {
    ok: true,
    // Deliberately a projection rather than the record. A public page has no
    // business knowing the form's lawful basis, its retention period or which
    // organisation record it hangs off.
    form: {
      id: resolved.form.id,
      name: resolved.form.name,
      description: resolved.form.description,
      confirmationMessage: resolved.form.confirmationMessage,
    },
    fields: await repo.publicForms.fields(slug),
  };
}

export interface PublicSubmitResult {
  ok: boolean;
  problems?: { fieldKey: string; message: string }[];
  message?: string;
}

/**
 * The only unauthenticated write in the product.
 *
 * Authorisation cannot protect it, so three other things do: a rate limit
 * keyed on the slug and a coarse token, the spam assessment inside `submit`,
 * and the fact that a public submission always lands as `awaiting_review` and
 * can therefore change nothing until a person looks at it.
 *
 * The rate limit is in-process and per-instance, which is honest for a form
 * whose failure mode is a review queue somebody has to clear.
 */
export async function submitPublicForm(
  slug: string,
  values: Record<string, ClaimValue | undefined>,
  options: { honeypotValue?: string; secondsOnPage?: number; sourceToken?: string } = {},
): Promise<PublicSubmitResult> {
  const repo = getRepository();
  const resolved = await repo.publicForms.resolveBySlug(slug);
  if (!resolved) return { ok: false, message: "That form is not available." };

  const limit = resolved.form.rateLimitPerHour ?? 20;
  const window = rateLimit(`form:${slug}:${options.sourceToken ?? "anonymous"}`, {
    limit,
    windowMs: 3_600_000,
  });
  if (!window.allowed) {
    return {
      ok: false,
      message: "Too many responses from here in the last hour. Please try again later.",
    };
  }

  const result = await repo.publicForms.submit(slug, {
    values,
    honeypotValue: options.honeypotValue,
    secondsOnPage: options.secondsOnPage,
    sourceToken: options.sourceToken,
  });

  return result.ok
    ? { ok: true, message: resolved.form.confirmationMessage ?? "Thank you." }
    : { ok: false, problems: result.problems, message: result.message };
}
