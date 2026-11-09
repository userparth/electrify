import Link from 'next/link';

export const metadata = { title: 'Terms of use · Electronics Bench' };

export default function Page() {
  return (
    <main className="home legal">
      <Link href="/">← Electronics Bench</Link>
      <h1>Terms of use</h1>
      <p><i>Last updated: 9 November 2026</i></p>
      <p>Electronics Bench is a free learning tool. By using it you agree to these terms.</p>
      <h2>Learning only</h2>
      <p>The simulator is a teaching model. Real circuits, mains power, batteries and solar systems can be dangerous: check real designs with a qualified person and the datasheets before building them. We are not responsible for damage or injury from anything built using this site.</p>
      <h2>Fair use</h2>
      <p>Don&apos;t abuse the service, for example by flooding the Arduino compiler or trying to break into other users&apos; accounts. We may limit or remove access that harms the service.</p>
      <h2>Accounts and classes</h2>
      <p>Signing in is optional. Teachers are responsible for who they invite to their classes. See the <Link href="/privacy">privacy policy</Link> for what is stored.</p>
      <h2>Open source</h2>
      <p>The source code is licensed under the <a href="https://github.com/userparth/electrify">GNU AGPL-3.0-or-later</a>. The service is provided &quot;as is&quot;, without warranty.</p>
      <p>Contact: <a href="mailto:userparth@gmail.com">userparth@gmail.com</a></p>
    </main>
  );
}
