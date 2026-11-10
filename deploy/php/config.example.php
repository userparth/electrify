<?php
// Copy to <tools folder>/config.php on the server (outside the web root) and fill in the blanks.
return [
  'db' => [
    'host' => 'localhost',
    'name' => '',      // hPanel → Databases → MySQL database name, e.g. u597408147_electrify
    'user' => '',      // database user
    'pass' => '',      // database password
  ],
  'google' => [
    'client_id' => '',     // Google Cloud Console → Credentials → OAuth client ID (Web application)
    'client_secret' => '', // the client secret shown next to it
  ],
  // Mailbox that sends sign-in codes (hPanel → Emails). Hostinger SMTP: smtp.hostinger.com, port 465 (SSL).
  'mail' => [
    'host' => 'smtp.hostinger.com',
    'port' => 465,
    'user' => 'noreply@getparth.com',
    'pass' => '',      // the mailbox password
    'from' => 'noreply@getparth.com',
    'from_name' => 'Electronics Bench',
  ],
  // Public address of the app, used for the OAuth redirect: https://<host>/api/auth.php
  'base_url' => 'https://electrify.getparth.com',
];
