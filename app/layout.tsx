import type { ReactNode } from 'react';
import { Suspense } from 'react';
import PublicHeader from '../components/template/PublicHeader';
import PublicFooter from '../components/template/PublicFooter';
import NavigationWarmup from '../components/template/NavigationWarmup';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('ksfdc-theme');
                var theme = stored === 'light' || stored === 'dark'
                  ? stored
                  : 'dark';
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch (_) {}
            `
          }}
        />
      </head>
      <body>
        <NavigationWarmup />
        <div className="app-shell">
          <Suspense fallback={null}>
            <PublicHeader />
          </Suspense>
          <main className="page-frame">{children}</main>
          <Suspense fallback={null}>
            <PublicFooter />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
