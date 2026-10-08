<?php
/**
 * Shared settings for the live dashboard: callsign, timezone, lookup
 * service, banner text and which optional panels to show. Used by
 * live/index.php and live/cfg.php (the admin page fetches the latter).
 */

$root = $_SERVER['DOCUMENT_ROOT'];
require_once($root . '/config/version.php');
require_once($root . '/config/ircddblocal.php');
include_once $root . '/config/config.php';
include_once $root . '/mmdvmhost/tools.php';
include_once $root . '/mmdvmhost/functions.php';

// Gateway callsign, read the same way /index.php does.
$configs = array();
if ($configfile = @fopen($gatewayConfigPath, 'r')) {
    while ($line = fgets($configfile)) {
        if (strpos($line, '=') === false) { continue; }
        list($key, $value) = preg_split('/=/', $line, 2);
        $value = trim(str_replace('"', '', $value));
        if ($key != 'ircddbPassword' && strlen($value) > 0) { $configs[$key] = $value; }
    }
    fclose($configfile);
}
$myCall = strtoupper(isset($configs['gatewayCallsign']) ? $configs['gatewayCallsign'] : $callsign);

$release = @parse_ini_file('/etc/pistar-release', true);
$pistarVersion = isset($release['Pi-Star']['Version']) ? $release['Pi-Star']['Version'] : '';

// Banner text and callsign lookup service from /etc/pistar-css.ini.
$bannerH1 = '';
$bannerExt = '';
$lookup = 'RadioID';
if (file_exists('/etc/pistar-css.ini')) {
    $css = @parse_ini_file('/etc/pistar-css.ini', true);
    if (!empty($css['BannerH1']['Enabled'])) { $bannerH1 = $css['BannerH1']['Text']; }
    if (!empty($css['BannerExtText']['Enabled'])) { $bannerExt = $css['BannerExtText']['Text']; }
    if (isset($css['Lookup']['Service']) && $css['Lookup']['Service'] === 'QRZ') { $lookup = 'QRZ'; }
}

$cfg = array(
    'call'     => $myCall,
    'tz'       => date_default_timezone_get(),
    'tzAbbr'   => date('T'),
    'lookup'   => $lookup,
    'dstarNet' => getConfigItem('D-Star Network', 'Enable', $mmdvmconfigs) == 1,
    'pocsag'   => getConfigItem('POCSAG Network', 'Enable', $mmdvmconfigs) == 1,
);
$cfg['pistarVersion'] = $pistarVersion;
$cfg['dashVersion'] = $version;
// false in DStarRepeater mode: no /live/ dashboard or LCD feed there.
$cfg['mmdvm'] = file_exists('/etc/dstar-radio.mmdvmhost');
$cfg['hostname'] = trim((string)@file_get_contents('/etc/hostname'));
$cfg['bannerH1'] = $bannerH1;
$cfg['bannerExt'] = $bannerExt;
