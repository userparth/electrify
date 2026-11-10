<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
$db = !empty(eb_config()['db']['name']);
$methods = ['google' => $db && !empty(eb_config()['google']['client_id']), 'email' => $db && eb_mail_ready()];
$configured = $methods['google'] || $methods['email'];
eb_json(['user' => $configured ? eb_user() : null, 'configured' => $configured, 'methods' => $methods]);
