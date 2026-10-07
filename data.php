<?php
/**
 * JSON feed for /live/ — one request per poll instead of the three the
 * stock page makes (repeaterinfo + lh + localtx), so the MMDVM log is
 * parsed once per tick.
 *
 * Returns:
 *   now           server time, UTC "Y-m-d H:i:s" (client clock-skew fix)
 *   lastHeard     $lastHeard from mmdvmhost/functions.php, as objects
 *   repeaterInfo  the stock mmdvmhost/repeaterinfo.php HTML, unmodified;
 *                 the client reads its tables so every mode, bridge and
 *                 status rule stays exactly as upstream implements it.
 */

ini_set('display_errors', '0');

require_once(__DIR__ . '/compat.inc.php');
live_security_headers(true);

$root = $_SERVER['DOCUMENT_ROOT'];
include_once $root . '/config/config.php';
include_once $root . '/mmdvmhost/tools.php';
include_once $root . '/mmdvmhost/functions.php';   // populates $lastHeard
include_once $root . '/config/language.php';

ob_start();
include $root . '/mmdvmhost/repeaterinfo.php';     // reuses the parse above (include_once)
$repeaterInfo = ob_get_clean();

// $lastHeard rows as objects (same fields everywhere).
function live_row($e)
{
    return array(
        'time'   => trim((string)$e[0]),
        'mode'   => trim((string)$e[1]),
        'call'   => trim((string)$e[2]),
        'suffix' => trim((string)$e[3]),
        'target' => trim((string)$e[4]),
        'src'    => trim((string)$e[5]),
        // Same "still on air" test lh.php uses.
        'live'   => ($e[6] == null),
        'dur'    => trim((string)$e[6]),
        'loss'   => isset($e[7]) ? trim((string)$e[7]) : '',
        'ber'    => isset($e[8]) ? trim((string)$e[8]) : '',
        'rssi'   => isset($e[9]) ? trim((string)$e[9]) : '',
    );
}

$rows = array();
if (isset($lastHeard) && is_array($lastHeard)) {
    foreach ($lastHeard as $e) {
        if (!empty($e[2])) { $rows[] = live_row($e); }
    }
}

/*
 * ?history=1: the last LIVE_HISTORY calls as individual events. The stock
 * $lastHeard keeps only the newest call per station/mode/slot and reads
 * just 250 log lines, so this reads a larger tail of the MMDVM log and runs
 * Pi-Star's own getHeardList() parser over it, without the de-duplication.
 * Requested occasionally by the client (on load, when a call starts or
 * ends, otherwise every few seconds) to keep the Pi's load down.
 */
define('LIVE_HISTORY', 100);

// Last $max lines of $path matching $match (and not $exclude), oldest first.
function live_log_tail($path, $match, $exclude, $max, $window = 524288)
{
    if (!is_readable($path)) { return array(); }
    $size = filesize($path);
    if (!$size) { return array(); }
    $fp = fopen($path, 'rb');
    if ($fp === false) { return array(); }
    $from = max(0, $size - $window);
    fseek($fp, $from);
    $buf = (string)fread($fp, $size - $from);
    fclose($fp);
    if ($from > 0) {                         // drop the partial first line
        $nl = strpos($buf, "\n");
        $buf = ($nl === false) ? '' : substr($buf, $nl + 1);
    }
    $out = array();
    foreach (explode("\n", $buf) as $line) {
        if ($line === '' || !preg_match($match, $line) || preg_match($exclude, $line)) { continue; }
        $out[] = $line;
    }
    return array_slice($out, -$max);
}

$history = null;
if (isset($_GET['history']) && defined('MMDVMLOGPATH') && function_exists('getHeardList')) {
    // Same line filter as getMMDVMLog(); each call is about two lines.
    $matchR = '/^M.*(from|end|watchdog|lost|slow data)/';
    $excR   = '/(CSBK|overflow|Downlink)/';
    $want   = LIVE_HISTORY * 6;
    $logToday  = MMDVMLOGPATH . '/' . MMDVMLOGPREFIX . '-' . gmdate('Y-m-d') . '.log';
    $logYstday = MMDVMLOGPATH . '/' . MMDVMLOGPREFIX . '-' . gmdate('Y-m-d', time() - 86340) . '.log';
    $lines = live_log_tail($logToday, $matchR, $excR, $want);
    if (count($lines) < $want) {             // early in the UTC day: top up from yesterday
        $older = live_log_tail($logYstday, $matchR, $excR, $want - count($lines), 2097152);
        $lines = array_merge($older, $lines);
    }
    array_multisort($lines, SORT_DESC);      // newest first, as getLastHeard() expects
    $history = array();
    $prev = null;
    foreach (getHeardList($lines) as $e) {
        if (empty($e[2])) { continue; }
        $m = $e[1];
        // Same mode filter as getLastHeard().
        if (!in_array($m, array('D-Star', 'YSF', 'P25', 'NXDN', 'M17', 'POCSAG'), true) && strpos($m, 'DMR') !== 0) { continue; }
        $row = live_row($e);
        // getHeardList() yields each call twice: once at its end and once at
        // its start, same details, about one duration apart. Keep the first
        // (newest), which is the row the stock dashboard shows.
        if ($prev !== null && !$row['live'] && !$prev['live']
            && $row['call'] === $prev['call'] && $row['mode'] === $prev['mode']
            && $row['target'] === $prev['target'] && $row['src'] === $prev['src'] && $row['dur'] === $prev['dur']
            && abs(strtotime($prev['time'] . ' UTC') - strtotime($row['time'] . ' UTC')) <= (float)$row['dur'] + 3) {
            continue;
        }
        $history[] = $row;
        $prev = $row;
        if (count($history) >= LIVE_HISTORY) { break; }
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(
    array('now' => gmdate('Y-m-d H:i:s'), 'lastHeard' => $rows, 'history' => $history, 'repeaterInfo' => $repeaterInfo),
    LIVE_JSON_FLAGS
);
