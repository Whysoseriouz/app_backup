import type { Metadata } from 'next';
import './globals.css';
import { CurrentUserProvider } from '@/components/CurrentUserContext';

export const metadata: Metadata = {
  title: 'Backup Check · OrgaSoft Kommunal',
  description: 'Tägliche Bestätigung der Veeam-Backup-Jobs',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

const themeInitScript = `(function(){
  try {
    var s = localStorage.getItem('backup-check:theme');
    var t = s || 'system';
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = t === 'dark' || (t === 'system' && sys);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
  window.addEventListener('beforeprint', function () {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.dataset.wasDark = '1';
      document.documentElement.classList.remove('dark');
    }
  });
  window.addEventListener('afterprint', function () {
    if (document.documentElement.dataset.wasDark === '1') {
      document.documentElement.classList.add('dark');
      delete document.documentElement.dataset.wasDark;
    }
  });
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <CurrentUserProvider>{children}</CurrentUserProvider>
      </body>
    </html>
  );
}
