<?php
/**
 * Caching/optimisation plugin exclusions and consent plugin detection.
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Keeps r1.js out of "delay JavaScript", deferral, minification and combining,
 * and reports what was found in the hello (Data contract v1 §8).
 */
class Rate1_Connector_Compat {

	/** Consent plugins detected by folder slug. */
	const CONSENT_PLUGINS = array(
		'borlabs-cookie',
		'complianz-gdpr',
		'complianz-gdpr-premium',
		'real-cookie-banner',
		'real-cookie-banner-pro',
		'cookie-law-info',
	);

	/**
	 * Register exclusion filters. Runs at plugin load: LiteSpeed Cache reads its
	 * exclusions on init (priority 5).
	 */
	public static function init() {
		// WP Rocket.
		add_filter( 'rocket_delay_js_exclusions', array( __CLASS__, 'add_needle' ) );
		add_filter( 'rocket_exclude_defer_js', array( __CLASS__, 'add_needle' ) );
		add_filter( 'rocket_minify_excluded_external_js', array( __CLASS__, 'add_needle' ) );
		// LiteSpeed Cache.
		add_filter( 'litespeed_optm_js_defer_exc', array( __CLASS__, 'add_needle' ) );
		add_filter( 'litespeed_optm_gm_js_exc', array( __CLASS__, 'add_needle' ) );
		add_filter( 'litespeed_optimize_js_excludes', array( __CLASS__, 'add_needle' ) );
		// Autoptimize.
		add_filter( 'autoptimize_filter_js_exclude', array( __CLASS__, 'autoptimize_exclude' ) );
	}

	/**
	 * Host and path of r1.js, e.g. "collect.bazed.live/v1/r1.js".
	 *
	 * Used both as a substring (LiteSpeed, Autoptimize, WP Rocket external JS
	 * minify) and as a regex (WP Rocket delay/defer/combine), where the unescaped
	 * dots match themselves.
	 *
	 * @return string
	 */
	public static function needle() {
		return (string) preg_replace( '#^[a-z][a-z0-9+.\-]*://#i', '', Rate1_Connector_Tag::script_url() );
	}

	/**
	 * Append the r1.js needle to an exclusion list.
	 *
	 * @param mixed $exclusions Exclusions.
	 * @return mixed
	 */
	public static function add_needle( $exclusions ) {
		if ( ! is_array( $exclusions ) ) {
			return $exclusions;
		}
		if ( ! in_array( self::needle(), $exclusions, true ) ) {
			$exclusions[] = self::needle();
		}
		return $exclusions;
	}

	/**
	 * Autoptimize: comma-separated string by default, or an array keyed by needle.
	 *
	 * @param mixed $exclude Exclusions.
	 * @return mixed
	 */
	public static function autoptimize_exclude( $exclude ) {
		$needle = self::needle();
		if ( is_array( $exclude ) ) {
			if ( ! isset( $exclude[ $needle ] ) ) {
				$exclude[ $needle ] = '';
			}
			return $exclude;
		}
		if ( ! is_string( $exclude ) ) {
			return $exclude;
		}
		if ( false !== strpos( $exclude, $needle ) ) {
			return $exclude;
		}
		$exclude = rtrim( trim( $exclude ), ',' );
		return '' === $exclude ? $needle : $exclude . ', ' . $needle;
	}

	/**
	 * Whether the needle comes out of a filter (our callback is attached and not undone).
	 *
	 * @param string $hook    Filter.
	 * @param mixed  $initial Initial value.
	 * @return bool
	 */
	private static function excluded_by( $hook, $initial = array() ) {
		$value = apply_filters( $hook, $initial, '' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Third-party hooks (WP Rocket, LiteSpeed, Autoptimize), read to verify our exclusion.
		if ( is_array( $value ) ) {
			return in_array( self::needle(), $value, true ) || isset( $value[ self::needle() ] );
		}
		return is_string( $value ) && false !== strpos( $value, self::needle() );
	}

	/**
	 * Cache/optimisation plugins for the hello: { plugin, delay_js, r1_excluded }.
	 *
	 * @return array[]
	 */
	public static function cache_report() {
		$out = array();

		if ( defined( 'WP_ROCKET_VERSION' ) || self::is_active( 'wp-rocket' ) ) {
			$out[] = array(
				'plugin'      => 'wp-rocket',
				'delay_js'    => function_exists( 'get_rocket_option' ) ? (bool) get_rocket_option( 'delay_js' ) : null,
				'r1_excluded' => self::excluded_by( 'rocket_delay_js_exclusions' ) && self::excluded_by( 'rocket_exclude_defer_js' ) && self::excluded_by( 'rocket_minify_excluded_external_js' ),
			);
		}

		if ( defined( 'LSCWP_V' ) || self::is_active( 'litespeed-cache' ) ) {
			$mode  = apply_filters( 'litespeed_conf', 'optm-js_defer' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- LiteSpeed Cache's documented API to read a setting.
			$out[] = array(
				'plugin'      => 'litespeed-cache',
				// 0 = off, 1 = deferred, 2 = delayed.
				'delay_js'    => is_numeric( $mode ) ? 2 === (int) $mode : null,
				'r1_excluded' => self::excluded_by( 'litespeed_optm_js_defer_exc' ) && self::excluded_by( 'litespeed_optimize_js_excludes' ),
			);
		}

		if ( defined( 'AUTOPTIMIZE_PLUGIN_VERSION' ) || self::is_active( 'autoptimize' ) ) {
			$out[] = array(
				'plugin'      => 'autoptimize',
				// Autoptimize (free) has no delay feature; it never aggregates external scripts.
				'delay_js'    => false,
				'r1_excluded' => self::excluded_by( 'autoptimize_filter_js_exclude', '' ),
			);
		}

		// Reported only; r1.js is not excluded there yet.
		if ( self::is_active( 'perfmatters' ) ) {
			$options = get_option( 'perfmatters_options' );
			$out[]   = array(
				'plugin'      => 'perfmatters',
				'delay_js'    => is_array( $options ) && isset( $options['assets']['delay_js'] ) ? (bool) $options['assets']['delay_js'] : null,
				'r1_excluded' => false,
			);
		}
		if ( self::is_active( 'flying-press' ) ) {
			$out[] = array(
				'plugin'      => 'flying-press',
				'delay_js'    => null,
				'r1_excluded' => false,
			);
		}
		if ( self::is_active( 'sg-cachepress' ) ) {
			$out[] = array(
				'plugin'      => 'sg-cachepress',
				// SiteGround Optimizer has no delay-JS feature.
				'delay_js'    => false,
				'r1_excluded' => false,
			);
		}
		return $out;
	}

	/**
	 * Consent plugins for the hello: { plugin, r1_category }. The category r1.js
	 * is filed under is not detected yet.
	 *
	 * @return array[]
	 */
	public static function consent_report() {
		$out = array();
		foreach ( self::CONSENT_PLUGINS as $slug ) {
			if ( self::is_active( $slug ) ) {
				$out[] = array(
					'plugin'      => $slug,
					'r1_category' => 'unknown',
				);
			}
		}
		return $out;
	}

	/**
	 * Whether a plugin with this folder slug is active on this site (or network-wide).
	 *
	 * @param string $folder Plugin folder.
	 * @return bool
	 */
	public static function is_active( $folder ) {
		$active = (array) get_option( 'active_plugins', array() );
		if ( is_multisite() ) {
			$active = array_merge( $active, array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) );
		}
		foreach ( $active as $plugin ) {
			$parts = explode( '/', (string) $plugin, 2 );
			if ( 2 === count( $parts ) && $parts[0] === $folder ) {
				return true;
			}
		}
		return false;
	}
}
