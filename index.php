<?php
/**
 * Modern live dashboard (MMDVMHost mode) — read-only.
 *
 * A restyled front end for the stock Pi-Star dashboard. It renders the
 * same data as /index.php: repeater info, gateway activity, local RF
 * activity, plus the D-Star CCS and POCSAG panels when those modes are
 * enabled. All parsing stays in the stock code — see live/data.php.
 *
 * Lives in an untracked folder so pistar-update (git pull / reset --hard,
 * never git clean) leaves it alone. The stock dashboard is untouched.
 */

require_once(__DIR__ . '/compat.inc.php');
live_security_headers(false);

// The DStarRepeater variant of Pi-Star has a different data model;
// leave that to the stock dashboard.
if (!file_exists('/etc/dstar-radio.mmdvmhost')) {
    header('Location: /index.php');
    exit;
}

require_once(__DIR__ . '/cfg.inc.php');

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title><?php echo h($myCall); ?> hotspot</title>
<link rel="icon" href="/images/favicon.ico" type="image/x-icon">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="saira.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="shell.css?v=<?php echo h(filemtime(__DIR__ . '/shell.css')); ?>">
<link rel="stylesheet" href="app.css?v=<?php echo h(filemtime(__DIR__ . '/app.css')); ?>">
<script src="shell.js?v=<?php echo h(filemtime(__DIR__ . '/shell.js')); ?>"></script>
<!-- No closing head tag on purpose: nginx injects the stock-page skin before it. -->
<body>
<script type="application/json" id="cfg"><?php echo json_encode($cfg, JSON_HEX_TAG | JSON_HEX_AMP); ?></script>

<!-- The faceplate header (callsign, LCD readout, nav) is built by shell.js. -->

<?php if ($bannerH1 !== '' || $bannerExt !== '') { ?>
<div class="banner">
  <?php if ($bannerH1 !== '') { echo '<strong>' . h($bannerH1) . '</strong>'; } ?>
  <?php if ($bannerExt !== '') { echo '<span>' . h($bannerExt) . '</span>'; } ?>
</div>
<?php } ?>


<div id="liveRoot"></div>

<footer class="foot">
  <p>Pi-Star <?php echo h($pistarVersion); ?>, dashboard <?php echo h($version); ?>, host <?php echo h(trim(@file_get_contents('/etc/hostname'))); ?>.</p>
  <p>Pi-Star and its dashboard by Andy Taylor (MW0MWZ), with ircDDBGateway dashboard by Hans-J. Barthen (DL5DI) and MMDVMDash by Kim Huebel (DG9VH).
  Help is on the <a href="https://forum.pistar.uk/" target="_blank" rel="noopener">Pi-Star support forum</a>.</p>
</footer>

<script src="app.js?v=<?php echo h(filemtime(__DIR__ . '/app.js')); ?>"></script>
</body>
</html>
