<?php
/**
 * Live dashboard settings as JSON, for pages that mount the live layout
 * themselves (the restyled /admin/ page).
 */

ini_set('display_errors', '0');
require_once(__DIR__ . '/compat.inc.php');
live_security_headers(true);

require_once(__DIR__ . '/cfg.inc.php');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode($cfg, LIVE_JSON_FLAGS);
