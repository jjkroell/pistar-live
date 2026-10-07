<?php
/**
 * Compatibility helpers so /live/ runs on older Pi-Star dashboards too:
 * security_headers.php only exists on newer builds, and PHP 7.0 (Pi-Star
 * on Stretch) lacks JSON_INVALID_UTF8_SUBSTITUTE.
 */

function live_security_headers($embeddable)
{
    $f = $_SERVER['DOCUMENT_ROOT'] . '/config/security_headers.php';
    if (!file_exists($f)) { return; }
    require_once($f);
    if ($embeddable && function_exists('setEmbeddableSecurityHeaders')) { setEmbeddableSecurityHeaders(); }
    elseif (!$embeddable && function_exists('setSecurityHeaders')) { setSecurityHeaders(); }
}

define('LIVE_JSON_FLAGS', JSON_PARTIAL_OUTPUT_ON_ERROR
    | (defined('JSON_INVALID_UTF8_SUBSTITUTE') ? JSON_INVALID_UTF8_SUBSTITUTE : 0));
