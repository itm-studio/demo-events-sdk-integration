import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Upcoming Events — ITM Partner SDK Demo',
  description: 'Browse upcoming events and RSVP using the ITM Partner SDK.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
