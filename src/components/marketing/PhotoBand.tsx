import Image from "next/image";
import { PHOTOS } from "@/lib/marketing/content";

/**
 * A band of photographs under the personas.
 *
 * Renders nothing until `PHOTOS` has entries, which is the state the site
 * ships in. An empty band is better than a filled one here: the alternative is
 * stock photography of models standing in for charities that do not use the
 * product yet, which is the same claim as an invented testimonial and is
 * ruled out by the same rule (`MARKETING_SITE_ARCHITECTURE.md` §9.1).
 *
 * When the real photographs exist, this is where they go. `next/image` sizes
 * and formats them, and the intrinsic dimensions come from the content entry
 * so the layout never shifts while they load.
 */
export function PhotoBand() {
  if (PHOTOS.length === 0) return null;

  return (
    <div className="mt-14">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PHOTOS.map((photo) => (
          <li key={photo.src}>
            <figure>
              <div className="overflow-hidden rounded-xl border border-line bg-surface-sunken">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
                  className="h-56 w-full object-cover"
                />
              </div>
              <figcaption className="mt-3 text-[0.8125rem] leading-snug text-ink-subtle">
                {photo.caption}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
