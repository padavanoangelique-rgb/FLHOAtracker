import './globals.css';

export const metadata = {
  title: 'HOA Tracker',
  description: 'HOA contact and job tracking for Majestic Permits / The Permit Closet'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
