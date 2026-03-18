/** Serializable moment type passed to client components */
export interface EventMoment {
  uid: string;
  name: string;
  slug: string;
  externalUrl: string | null;
  blurb: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: string;
  type: string;
  category: string;
  coverImage: {
    url: string;
    mimeType: string;
  } | null;
  soldOut: boolean;
  timezone: string;
  venue: {
    name: string;
    city: string;
    country: string;
    address: string | null;
  } | null;
  ticketTiers: Array<{
    uid: string;
    name: string;
    description: string | null;
    price: number;
    currency: { code: string; symbol: string };
    isActive: boolean;
    soldOut: boolean;
    maxPerUser: number;
  }>;
}
