/**
 * Where an entity lives in the application.
 *
 * A pure lookup with no dependencies, because every layer needs it: server
 * services resolving a relationship timeline, and the intelligence surfaces
 * turning a citation into something a reader can follow. A citation that
 * cannot be opened is a citation that cannot be checked, so this is closer to
 * a correctness concern than a routing convenience.
 *
 * Returning `undefined` for an unmapped type is deliberate. Some entities are
 * addressable in the graph without having a page of their own — an allocation,
 * a measurement, a claim — and rendering a dead link for them would be worse
 * than rendering plain text.
 */
export function hrefForEntity(type: string, id: string): string | undefined {
  switch (type) {
    case "grant":
      return `/grants/${id}`;
    case "application":
      return `/applications/${id}`;
    case "funding_opportunity":
      return `/funding/${id}`;
    case "programme":
      return `/programmes/${id}`;
    case "impact_report":
      return `/impact/${id}`;
    case "evidence":
      return "/evidence";
    case "external_organisation":
      return `/relationships/${id}`;
    case "person":
      return `/relationships/people/${id}`;
    default:
      return undefined;
  }
}
