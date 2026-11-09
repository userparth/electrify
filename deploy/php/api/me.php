<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
$configured = !empty(eb_config()['db']['name']) && !empty(eb_config()['google']['client_id']);
eb_json(['user' => $configured ? eb_user() : null, 'configured' => $configured]);
