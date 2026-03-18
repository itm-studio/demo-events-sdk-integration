import { getITMClient, getBrandSubdomain, getEmbedDomain } from '@/lib/itm';
import { EventList } from './components/EventList';
import type { EventMoment } from '@/lib/types';

export const dynamic = 'force-dynamic'; // always fetch fresh data

async function getEvents(): Promise<{
  moments: EventMoment[];
  totalCount: number;
}> {
  const itm = getITMClient();

  const { getPartnerMomentsForBrand } = await itm.query({
      getPartnerMomentsForBrand: {
        __args: { take: 100, sortOrder: 'ASC' as const },
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
        totalCount: true,
        hasNextPage: true,
      },
    });

  return {
    moments: getPartnerMomentsForBrand.moments as EventMoment[],
    totalCount: getPartnerMomentsForBrand.totalCount,
  };
}

export default async function Home() {
  const { moments, totalCount } = await getEvents();
  const brandSubdomain = getBrandSubdomain();
  const embedDomain = getEmbedDomain();

  // Separate upcoming/live from past
  const now = new Date();
  const upcoming = moments.filter(
    (m) => m.status === 'UPCOMING' || m.status === 'LIVE' || new Date(m.endDate) >= now,
  );
  const past = moments.filter(
    (m) => m.status === 'ENDED' && new Date(m.endDate) < now,
  );

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <h1>Events</h1>
            <p className="header-subtitle">Browse upcoming events and RSVP</p>
          </div>
          <span className="badge">
            {totalCount} event{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </header>
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
