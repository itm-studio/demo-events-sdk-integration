import { getITMClient, getBrandSubdomain, getEmbedDomain } from '@/lib/itm';
import { EventList } from '../../components/EventList';
import Link from 'next/link';
import type { EventMoment } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface CollectionLink {
  uid: string;
  url: string;
  label: string | null;
}

async function getCollection(slug: string): Promise<{
  name: string;
  description: string | null;
  subLabel: string | null;
  moments: EventMoment[];
  links: CollectionLink[];
} | null> {
  const itm = getITMClient();

  const { getPartnerMomentCollection } = await itm.query({
    getPartnerMomentCollection: {
      __args: { slug },
      name: true,
      description: true,
      subLabel: true,
      moments: {
        uid: true,
        name: true,
        slug: true,
        externalUrl: true,
        blurb: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        type: true,
        category: true,
        coverImage: {
          url: true,
          mimeType: true,
        },
        soldOut: true,
        timezone: true,
        venue: {
          name: true,
          city: true,
          country: true,
          address: true,
        },
        ticketTiers: {
          uid: true,
          name: true,
          description: true,
          price: true,
          currency: { code: true, symbol: true },
          isActive: true,
          soldOut: true,
          maxPerUser: true,
        },
      },
      links: {
        uid: true,
        url: true,
        label: true,
      },
    },
  });

  if (!getPartnerMomentCollection) return null;

  return {
    name: getPartnerMomentCollection.name,
    description: getPartnerMomentCollection.description ?? null,
    subLabel: getPartnerMomentCollection.subLabel ?? null,
    moments: getPartnerMomentCollection.moments as EventMoment[],
    links: getPartnerMomentCollection.links as CollectionLink[],
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  const brandSubdomain = getBrandSubdomain();
  const embedDomain = getEmbedDomain();

  if (!collection) {
    return (
      <>
        <header className="header">
          <div className="header-inner">
            <div className="header-left">
              <Link href="/" className="back-link">
                &larr; Back to Events
              </Link>
              <h1>Collection Not Found</h1>
            </div>
          </div>
        </header>
        <main className="main">
          <div className="empty-state">
            <h3>Collection not found</h3>
            <p>The collection &ldquo;{slug}&rdquo; doesn&apos;t exist or has been removed.</p>
          </div>
        </main>
      </>
    );
  }

  const now = new Date();
  const upcoming = collection.moments.filter(
    (m) => m.status === 'UPCOMING' || m.status === 'LIVE' || new Date(m.endDate) >= now,
  );
  const past = collection.moments.filter(
    (m) => m.status === 'ENDED' && new Date(m.endDate) < now,
  );

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <Link href="/" className="back-link">
              &larr; Back to Events
            </Link>
            <h1>{collection.name}</h1>
            {collection.subLabel && (
              <p className="collection-sublabel">{collection.subLabel}</p>
            )}
            {collection.description && (
              <p className="header-subtitle">{collection.description}</p>
            )}
          </div>
          <span className="badge">
            {collection.moments.length} event{collection.moments.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {collection.links.length > 0 && (
        <div className="collection-links">
          <div className="collection-links-inner">
            {collection.links.map((link) => (
              <a
                key={link.uid}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="collection-link"
              >
                {link.label || link.url}
              </a>
            ))}
          </div>
        </div>
      )}

      <main className="main">
        <EventList
          upcoming={upcoming}
          past={past}
          brandSubdomain={brandSubdomain}
          embedDomain={embedDomain}
        />
      </main>
    </>
  );
}
