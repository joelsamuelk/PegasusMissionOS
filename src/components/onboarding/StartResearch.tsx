"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button, Card, CardBody } from "@/components/shared/ui";
import { useToast } from "@/components/shared/Toast";
import { runOnboardingResearch } from "@/server/actions/onboarding";

/**
 * The whole of onboarding's input.
 *
 * Four fields, and three of them optional. That is the MG-3 promise made
 * literal: an organisation should get meaningful value before spending days
 * configuring anything, so the form asks for what it needs to *find* them, not
 * for what it wants to *know* about them.
 *
 * Everything else is researched, and everything researched is reviewed.
 */

const COUNTRIES = [
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
];

export function StartResearch() {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [country, setCountry] = useState("GB");
  const [registrationNumber, setRegistrationNumber] = useState("");

  const submit = () => {
    startTransition(async () => {
      const result = await runOnboardingResearch({
        name,
        websiteUrl,
        country,
        registrationNumber,
      });
      notify(
        result.message ?? (result.ok ? "Research finished." : "That did not work."),
        result.ok ? "success" : "error",
      );
      if (result.ok) router.push("/onboarding/review");
    });
  };

  const field =
    "mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink " +
    "placeholder:text-ink-subtle focus:border-accent focus:outline-none";

  return (
    <Card>
      <CardBody className="p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="org-name" className="text-sm font-medium text-ink">
              Organisation name
            </label>
            <input
              id="org-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Northstar Community Foundation"
              className={field}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="org-website" className="text-sm font-medium text-ink">
              Website <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <input
              id="org-website"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="northstarcf.org.uk"
              className={field}
            />
            <p className="mt-1.5 text-xs text-ink-subtle">
              Pegasus reads a handful of your public pages. It respects your robots.txt and
              identifies itself.
            </p>
          </div>

          <div>
            <label htmlFor="org-country" className="text-sm font-medium text-ink">
              Country
            </label>
            <select
              id="org-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className={field}
            >
              {COUNTRIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="org-registration" className="text-sm font-medium text-ink">
              Charity or company number{" "}
              <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <input
              id="org-registration"
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value)}
              placeholder="1184023"
              className={field}
            />
            <p className="mt-1.5 text-xs text-ink-subtle">
              Lets Pegasus confirm your details against the official register.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button size="lg" onClick={submit} disabled={pending || !name.trim()}>
            <Search className="h-4 w-4" aria-hidden />
            {pending ? "Researching" : "Research my organisation"}
          </Button>
          <p className="text-xs text-ink-subtle">
            Nothing is added to your profile until you have reviewed it.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
