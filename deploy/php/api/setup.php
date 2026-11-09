<?php
// Run once from SSH: php setup.php — creates the tables. Refuses to run from the web.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib.php';
$sql = file_get_contents(__DIR__ . '/schema.sql');
foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) eb_db()->exec($stmt);
echo "Tables ready.\n";
