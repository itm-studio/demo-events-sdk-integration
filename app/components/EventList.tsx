'use client';

import { useState, useCallback } from 'react';
import type { EventMoment } from '@/lib/types';
import { CheckoutEmbed } from './CheckoutEmbed';

interface EventListProps {
  upcoming: EventMoment[];
  past: EventMoment[];
  brandSubdomain: string;
  embedDomain: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEventDate(startStr: string, endStr: string, timezone: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);

  try {
    const datePart = start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    });
    const startTime = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
    const endTime = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
    const tzAbbr = start.toLocaleTimeString('en-US', {
      timeZoneName: 'short',
      timeZone: timezone,
    }).split(' ').pop();

    const sameDay =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();

    if (sameDay) {
      return `${datePart} · ${startTime} – ${endTime} ${tzAbbr}`;
    }

    const endDatePart = end.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
    return `${datePart}, ${startTime} – ${endDatePart}, ${endTime} ${tzAbbr}`;
  } catch {
    return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }
}

function formatShortDate(dateStr: string, timezone: string): { month: string; day: string } {
  const d = new Date(dateStr);
  try {
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', timeZone: timezone }).toUpperCase(),
      day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone }),
    };
  } catch {
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    };
  }
}

function formatPrice(priceInCents: number, currency: { code: string; symbol: string }): string {
  if (priceInCents === 0) return 'Free';
  const dollars = priceInCents / 100;
  return `${currency.symbol}${dollars.toFixed(2)}`;
}

function getCategoryLabel(category: string): string {
  return category
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPriceRange(tiers: EventMoment['ticketTiers']): string {
  const active = tiers.filter((t) => t.isActive);
  if (active.length === 0) return '';
  const prices = active.map((t) => t.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const currency = active[0].currency;
  if (min === max) return formatPrice(min, currency);
  return `${formatPrice(min, currency)} – ${formatPrice(max, currency)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EventList({ upcoming, past, brandSubdomain, embedDomain }: EventListProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<{
    momentSlug: string;
    momentName: string;
    embedUrl: string;
  } | null>(null);

  const openCheckout = useCallback(
    (moment: EventMoment) => {
      const embedUrl = `https://${brandSubdomain}.${embedDomain}/m/${moment.slug}/embed/inline`;
      setCheckoutState({
        momentSlug: moment.slug,
        momentName: moment.name,
        embedUrl,
      });
    },
    [brandSubdomain],
  );

  return (
    <>
      {/* Upcoming Events */}
      {upcoming.length > 0 && (
        <section className="events-section">
          <div className="section-header">
            <h2>Upcoming Events</h2>
            <span className="section-count">{upcoming.length}</span>
          </div>
          <div className="events-grid">
            {upcoming.map((moment) => (
              <EventCard
                key={moment.uid}
                moment={moment}
                isExpanded={expandedEvent === moment.uid}
                onToggle={() =>
                  setExpandedEvent(expandedEvent === moment.uid ? null : moment.uid)
                }
                onRSVP={() => openCheckout(moment)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past Events */}
      {past.length > 0 && (
        <section className="events-section">
          <div className="section-header">
            <h2>Past Events</h2>
            <span className="section-count">{past.length}</span>
          </div>
          <div className="events-grid">
            {past.map((moment) => (
              <EventCard
                key={moment.uid}
                moment={moment}
                isPast
                isExpanded={expandedEvent === moment.uid}
                onToggle={() =>
                  setExpandedEvent(expandedEvent === moment.uid ? null : moment.uid)
                }
                onRSVP={() => openCheckout(moment)}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <h3>No events yet</h3>
          <p>Check back soon for upcoming events.</p>
        </div>
      )}

      {/* Checkout Embed Modal */}
      {checkoutState && (
        <CheckoutEmbed
          momentName={checkoutState.momentName}
          embedUrl={checkoutState.embedUrl}
          onClose={() => setCheckoutState(null)}
        />
      )}
    </>
  );
}

// ─── EventCard ──────────────────────────────────────────────────────────────

function EventCard({
  moment,
  isPast,
  isExpanded,
  onToggle,
  onRSVP,
}: {
  moment: EventMoment;
  isPast?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRSVP: () => void;
}) {
  const activeTiers = moment.ticketTiers.filter((t) => t.isActive);
  const priceRange = getPriceRange(moment.ticketTiers);
  const shortDate = formatShortDate(moment.startDate, moment.timezone);

  return (
    <div className={`event-card ${isPast ? 'past' : ''} ${isExpanded ? 'expanded' : ''}`}>
      <div className="event-card-main" onClick={onToggle}>
        {/* Date badge */}
        <div className="date-badge">
          <span className="date-month">{shortDate.month}</span>
          <span className="date-day">{shortDate.day}</span>
        </div>

        {/* Event info */}
        <div className="event-info">
          <h3 className="event-name">{moment.name}</h3>
          <div className="event-details">
            <span>{formatEventDate(moment.startDate, moment.endDate, moment.timezone)}</span>
            {moment.venue && (
              <span>
                {moment.venue.name}
                {moment.venue.city ? `, ${moment.venue.city}` : ''}
              </span>
            )}
          </div>
          <div className="event-tags">
            <span className="tag category">{getCategoryLabel(moment.category)}</span>
            {moment.type === 'DIGITAL' && <span className="tag digital">Online</span>}
            {moment.soldOut && !moment.externalUrl ? (
              <span className="tag sold-out">Sold Out</span>
            ) : (
              <span className={`tag status-${moment.status.toLowerCase()}`}>
                {moment.status}
              </span>
            )}
            {priceRange && <span className="tag price">{priceRange}</span>}
          </div>
        </div>

        {/* RSVP button */}
        {!isPast && moment.externalUrl ? (
          <a
            className="rsvp-btn"
            href={moment.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Get Tickets
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </a>
        ) : !isPast && !moment.soldOut ? (
          <button
            className="rsvp-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRSVP();
            }}
          >
            {activeTiers.some((t) => t.price === 0) ? 'RSVP' : 'Get Tickets'}
          </button>
        ) : moment.soldOut && !isPast ? (
          <span className="sold-out-label">Sold Out</span>
        ) : null}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="event-expanded">
          {moment.blurb && <p className="event-blurb">{moment.blurb}</p>}
          {moment.description && <p className="event-description">{moment.description}</p>}

          {activeTiers.length > 0 && (
            <div className="tiers-section">
              <h4>Tickets</h4>
              <div className="tiers-list">
                {activeTiers.map((tier) => {
                  const soldOut = tier.remainingSupply === 0;
                  return (
                    <div key={tier.uid} className="tier-row">
                      <div className="tier-info">
                        <span className="tier-name">{tier.name}</span>
                        {tier.description && (
                          <span className="tier-desc">{tier.description}</span>
                        )}
                        <span className="tier-availability">
                          {soldOut
                            ? 'Sold out'
                            : `${tier.remainingSupply} remaining`}
                        </span>
                      </div>
                      <span className={`tier-price ${tier.price === 0 ? 'free' : ''}`}>
                        {formatPrice(tier.price, tier.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isPast && (
            moment.externalUrl ? (
              <a
                className="rsvp-btn-full"
                href={moment.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Tickets
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </a>
            ) : !moment.soldOut ? (
              <button className="rsvp-btn-full" onClick={onRSVP}>
                {activeTiers.some((t) => t.price === 0) ? 'RSVP Now' : 'Get Tickets'}
              </button>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
