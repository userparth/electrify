import Link from 'next/link';

export const metadata = { title: 'Privacy policy · Electronics Bench' };

export default function Page() {
  return (
    <main className="home legal">
      <Link href="/">← Electronics Bench</Link>
      <h1>Privacy policy</h1>
      <p><i>Last updated: 9 November 2026</i></p>
      <p>Electronics Bench is a free, open-source electronics-learning website run by Parth Sharma. You can use every lesson and the workbench without an account. Signing in is optional and only used to save your progress and to join a teacher&apos;s class.</p>
      <h2>What we store when you sign in with Google</h2>
      <ul>
        <li>Your Google account ID, email address, name and profile picture URL (the <code>openid email profile</code> scopes). We never see your Google password.</li>
        <li>Your lesson progress: which steps and quiz questions you completed.</li>
        <li>Classes you create or join, and the lessons a teacher assigns to a class. A teacher can see the name, email and lesson progress of students in their class.</li>
        <li>A session cookie that keeps you signed in for up to 30 days.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No ads, no tracking or analytics cookies, and we don&apos;t sell or share your data.</li>
        <li>We don&apos;t access your Gmail, Drive, contacts or any other Google data.</li>
      </ul>
      <h2>Without an account</h2>
      <p>Your circuits and progress are kept only in your browser&apos;s local storage. Arduino sketches you compile are sent to our server, compiled and cached; they aren&apos;t linked to you.</p>
      <h2>Where it is stored</h2>
      <p>On our hosting provider&apos;s server (Hostinger) in a MySQL database, over HTTPS.</p>
      <h2>Deleting your data</h2>
      <p>Open <Link href="/account">My progress</Link> and use <b>Delete my account</b>: your account, progress, classes and lesson assignments are removed from the server at once. You can also email <a href="mailto:userparth@gmail.com">userparth@gmail.com</a> from the address you signed in with. You can also remove the app&apos;s access any time at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
      <h2>Children</h2>
      <p>The site is meant for school and college students. Younger students should use it with a teacher or parent; the only personal data kept is what is listed above.</p>
      <h2>Changes</h2>
      <p>If this policy changes we&apos;ll update the date above. Questions: <a href="mailto:userparth@gmail.com">userparth@gmail.com</a>.</p>
      <p><Link href="/terms">Terms of use</Link></p>
    </main>
  );
}
