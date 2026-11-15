<?php
/**
 * Script tag, cache plugin exclusions, hello helpers.
 */

const KEY = 'pk_3fK9sQ2LmV7xYp1aB8cD4eFg';

// ------------------------------------------------------------------
T::group( 'Script tag' );
T::eq( Rate1_Connector_Tag::script_url(), 'https://collect.bazed.live/v1/r1.js', 'r1.js URL from RATE1_CONNECTOR_COLLECT_URL' );
T::eq( Rate1_Connector_Tag::should_print(), false, 'no site key → no tag' );
update_option( Rate1_Connector_Options::SITE_KEY, 'pk_short' );
T::eq( Rate1_Connector_Tag::should_print(), false, 'invalid site key → no tag' );
update_option( Rate1_Connector_Options::SITE_KEY, KEY );
T::eq( Rate1_Connector_Tag::should_print(), true, 'visitor → tag' );
WP_Stub::$logged_in = true;
WP_Stub::$caps      = array( 'read' );
T::eq( Rate1_Connector_Tag::should_print(), true, 'logged-in subscriber → tag' );
WP_Stub::$caps = array( 'read', 'edit_posts' );
T::eq( Rate1_Connector_Tag::should_print(), false, 'logged-in editor → no tag (default)' );
update_option( Rate1_Connector_Options::EXCLUDE_EDITORS, '0' );
T::eq( Rate1_Connector_Tag::should_print(), true, 'logged-in editor with the exclusion off → tag' );
WP_Stub::$logged_in = false;

$wp_tag = "<script src=\"https://collect.bazed.live/v1/r1.js\" id=\"rate1-r1-js\" defer data-wp-strategy=\"defer\"></script>\n";
$out    = Rate1_Connector_Tag::add_site_attribute( $wp_tag, 'rate1-r1', 'https://collect.bazed.live/v1/r1.js' );
T::eq( $out, "<script data-site=\"" . KEY . "\" src=\"https://collect.bazed.live/v1/r1.js\" id=\"rate1-r1-js\" defer data-wp-strategy=\"defer\"></script>\n", 'data-site added to the r1.js tag' );
T::eq( Rate1_Connector_Tag::add_site_attribute( $out, 'rate1-r1', '' ), $out, 'not added twice' );
T::eq( Rate1_Connector_Tag::add_site_attribute( '<script src="x.js"></script>', 'other', '' ), '<script src="x.js"></script>', 'other handles untouched' );
$with_inline = "<script id=\"rate1-r1-js-before\">var a=1;</script>\n" . $wp_tag;
T::ok( false !== strpos( Rate1_Connector_Tag::add_site_attribute( $with_inline, 'rate1-r1', '' ), '<script data-site="' . KEY . '" src=' ) && 0 === strpos( Rate1_Connector_Tag::add_site_attribute( $with_inline, 'rate1-r1', '' ), '<script id="rate1-r1-js-before">' ), 'inline "before" script left alone; attribute on the src tag' );

// ------------------------------------------------------------------
T::group( 'Cache plugin exclusions' );
T::eq( Rate1_Connector_Compat::needle(), 'collect.bazed.live/v1/r1.js', 'needle = host + path' );
Rate1_Connector_Compat::init();
foreach ( array( 'rocket_delay_js_exclusions', 'rocket_exclude_defer_js', 'rocket_minify_excluded_external_js', 'litespeed_optm_js_defer_exc', 'litespeed_optm_gm_js_exc', 'litespeed_optimize_js_excludes' ) as $hook ) {
	$out = apply_filters( $hook, array( 'jquery' ) );
	T::eq( $out, array( 'jquery', 'collect.bazed.live/v1/r1.js' ), "$hook: appended, existing kept" );
}
T::eq( apply_filters( 'rocket_delay_js_exclusions', array( 'collect.bazed.live/v1/r1.js' ) ), array( 'collect.bazed.live/v1/r1.js' ), 'not appended twice' );
T::eq( apply_filters( 'rocket_delay_js_exclusions', 'string' ), 'string', 'non-array left alone' );
T::eq( 1, preg_match( '#(' . Rate1_Connector_Compat::needle() . ')#i', '<script data-site="x" src="https://collect.bazed.live/v1/r1.js" defer></script>' ), 'needle works as WP Rocket regex on the tag' );
T::eq( apply_filters( 'autoptimize_filter_js_exclude', '', '' ), 'collect.bazed.live/v1/r1.js', 'Autoptimize: empty string' );
T::eq( apply_filters( 'autoptimize_filter_js_exclude', 'seal.js, js/jquery/jquery.js', '' ), 'seal.js, js/jquery/jquery.js, collect.bazed.live/v1/r1.js', 'Autoptimize: appended to the comma list' );
T::eq( apply_filters( 'autoptimize_filter_js_exclude', 'a.js, collect.bazed.live/v1/r1.js', '' ), 'a.js, collect.bazed.live/v1/r1.js', 'Autoptimize: not appended twice' );
T::eq( apply_filters( 'autoptimize_filter_js_exclude', array( 'a.js' => 'defer' ), '' ), array( 'a.js' => 'defer', 'collect.bazed.live/v1/r1.js' => '' ), 'Autoptimize: array form' );

T::group( 'Cache and consent plugin report' );
T::eq( Rate1_Connector_Compat::cache_report(), array(), 'nothing active → []' );
update_option( 'active_plugins', array( 'wp-rocket/wp-rocket.php', 'autoptimize/autoptimize.php', 'perfmatters/perfmatters.php', 'borlabs-cookie/borlabs-cookie.php', 'cookie-law-info/cookie-law-info.php', 'hello.php' ) );
function get_rocket_option( $k, $d = false ) {
	return 'delay_js' === $k ? 1 : $d;
}
update_option( 'perfmatters_options', array( 'assets' => array( 'delay_js' => '1' ) ) );
T::eq(
	Rate1_Connector_Compat::cache_report(),
	array(
		array( 'plugin' => 'wp-rocket', 'delay_js' => true, 'r1_excluded' => true ),
		array( 'plugin' => 'autoptimize', 'delay_js' => false, 'r1_excluded' => true ),
		array( 'plugin' => 'perfmatters', 'delay_js' => true, 'r1_excluded' => false ),
	),
	'WP Rocket (delay on, excluded), Autoptimize (excluded), Perfmatters (report only)'
);
T::eq(
	Rate1_Connector_Compat::consent_report(),
	array(
		array( 'plugin' => 'borlabs-cookie', 'r1_category' => 'unknown' ),
		array( 'plugin' => 'cookie-law-info', 'r1_category' => 'unknown' ),
	),
	'consent plugins by folder, r1_category unknown'
);
WP_Stub::$filters = array();
T::eq( Rate1_Connector_Compat::cache_report()[0]['r1_excluded'], false, 'filters removed → r1_excluded false' );

// ------------------------------------------------------------------
T::group( 'Homepage tag check' );
$html = '<html><head><script data-site="' . KEY . '" src="https://collect.bazed.live/v1/r1.js" id="rate1-r1-js" defer data-wp-strategy="defer"></script></head><body></body></html>';
T::eq( Rate1_Connector_Hello::html_has_tag( $html, KEY ), true, 'tag found' );
T::eq( Rate1_Connector_Hello::html_has_tag( str_replace( KEY, 'pk_000000000000000000000000', $html ), KEY ), false, 'other key → not found' );
T::eq( Rate1_Connector_Hello::html_has_tag( '<html><head></head></html>', KEY ), false, 'no tag → not found' );
T::eq( Rate1_Connector_Hello::html_has_tag( '<script type="rocketlazyloadscript" data-rocket-src="https://collect.bazed.live/v1/r1.js" data-site="' . KEY . '" defer></script>', KEY ), true, 'rewritten by a delay plugin → still found' );
T::eq( Rate1_Connector_Hello::html_has_tag( '<script>var u="/v1/r1.js"; var k="data-site=\"' . KEY . '\"";</script>', KEY ), false, 'mention inside inline script text → not counted' );
