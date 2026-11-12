import type { Metadata } from 'next';
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Figtree, Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import { EARLY_SCRIPT } from '@/lib/settings-core';
import { REPORT_SCRIPT } from '@/lib/report';
import { OnboardingGate } from '@/features/onboarding/Onboarding';
import { SignInDialog } from '@/features/account/SignIn';
import './globals.css';

const atk = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--f-atk', weight: ['400', '600', '700'] });
const atkm = Atkinson_Hyperlegible_Mono({ subsets: ['latin'], variable: '--f-atkm', weight: ['400', '700'] });
const inter = Inter({ subsets: ['latin'], variable: '--f-inter' });
const jb = JetBrains_Mono({ subsets: ['latin'], variable: '--f-jb' });
const plex = IBM_Plex_Sans({ subsets: ['latin'], variable: '--f-plex', weight: ['400', '600', '700'] });
const plexm = IBM_Plex_Mono({ subsets: ['latin'], variable: '--f-plexm', weight: ['400', '600'] });
const fig = Figtree({ subsets: ['latin'], variable: '--f-fig' });
const geistm = Geist_Mono({ subsets: ['latin'], variable: '--f-geistm' });

export const metadata: Metadata = {
  title: 'Electronics Bench',
  description: 'Interactive electronics workbench for schools and colleges',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="paper" data-font="atkinson" suppressHydrationWarning className={[atk, atkm, inter, jb, plex, plexm, fig, geistm].map(f => f.variable).join(' ')}>
      <head>{REPORT_SCRIPT && <script dangerouslySetInnerHTML={{ __html: REPORT_SCRIPT }} />}<script dangerouslySetInnerHTML={{ __html: EARLY_SCRIPT }} /></head>
      <body>{children}<OnboardingGate /><SignInDialog /></body>
    </html>
  );
}
