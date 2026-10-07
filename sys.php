<?php
/**
 * System health for /live/ — CPU temperature, load, memory, disk,
 * uptime and Raspberry Pi power/throttle flags. Plain file reads, no
 * log parsing; polled every 10 s. Temperature bands match the stock
 * dstarrepeater/system.php panel (<50 good, 50-68 warm, >=69 hot).
 */

ini_set('display_errors', '0');

require_once(__DIR__ . '/compat.inc.php');
live_security_headers(true);

$out = array();

$t = @file_get_contents('/sys/class/thermal/thermal_zone0/temp');
if ($t !== false && is_numeric(trim($t))) {
    $t = (float)trim($t);
    $out['tempC'] = round($t > 1000 ? $t / 1000 : $t, 1);
}

$load = sys_getloadavg();
if ($load !== false) { $out['load'] = array_map(function ($v) { return round($v, 2); }, $load); }

$cores = 0;
if ($cpuinfo = @file_get_contents('/proc/cpuinfo')) { $cores = preg_match_all('/^processor\s*:/m', $cpuinfo); }
$out['cores'] = $cores ?: 1;

if ($up = @file_get_contents('/proc/uptime')) { $out['uptime'] = (int)floatval($up); }

if ($mem = @file_get_contents('/proc/meminfo')) {
    $m = array();
    foreach (array('MemTotal', 'MemAvailable') as $k) {
        if (preg_match('/^' . $k . ':\s+(\d+)/m', $mem, $x)) { $m[$k] = (int)$x[1]; }
    }
    if (isset($m['MemTotal'], $m['MemAvailable']) && $m['MemTotal'] > 0) {
        $out['memUsedPct'] = (int)round(100 * (1 - $m['MemAvailable'] / $m['MemTotal']));
        $out['memTotalMB'] = (int)round($m['MemTotal'] / 1024);
    }
}

$total = @disk_total_space('/');
$free = @disk_free_space('/');
if ($total && $free !== false) {
    $out['diskUsedPct'] = (int)round(100 * (1 - $free / $total));
    $out['diskFreeGB'] = round($free / 1073741824, 1);
}

// Pi firmware throttle flags (hex). Low bits = happening now,
// bits 16+ = has happened since boot.
$th = @file_get_contents('/sys/devices/platform/soc/soc:firmware/get_throttled');
if ($th !== false && preg_match('/^[0-9a-fA-F]+$/', trim($th))) {
    $v = hexdec(trim($th));
    $out['power'] = array(
        'underVoltageNow'  => (bool)($v & 0x1),
        'throttledNow'     => (bool)($v & 0x6),
        'underVoltageSeen' => (bool)($v & 0x10000),
        'throttledSeen'    => (bool)($v & 0x60000),
    );
}

// Service status, as on the stock admin page (dstarrepeater/system.php).
// Only requested by /admin/, since it costs a few process lookups.
if (isset($_GET['services'])) {
    include_once $_SERVER['DOCUMENT_ROOT'] . '/mmdvmhost/tools.php';
    $mmdvmMode = file_exists('/etc/dstar-radio.mmdvmhost');
    $svc = array(
        array('MMDVMHost', 'MMDVMHost', false, $mmdvmMode),
        array('DStarRepeater', 'dstarrepeaterd', false, !$mmdvmMode),
        array('ircDDBGateway', 'ircddbgatewayd', false, false),
        array('TimeServer', 'timeserverd', false, false),
        array('PiStar-Watchdog', '/usr/local/sbin/pistar-watchdog', true, false),
        array('PiStar-Remote', '/usr/local/sbin/pistar-remote', true, false),
    );
    $out['services'] = array();
    foreach ($svc as $x) {
        $out['services'][] = array(
            'name' => $x[0],
            'running' => (bool)isProcessRunning($x[1], $x[2]),
            'critical' => $x[3],
        );
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode($out);
