<?php
/**
 * Plugin Name: WP Rocket (test stub)
 * Description: Test fixture only. Defines the WP Rocket constant and get_rocket_option() so rate1-connector's detection and exclusion filters can be checked without a WP Rocket licence. Does not optimise anything.
 * Version: 0.0.0-stub
 */

define( 'WP_ROCKET_VERSION', '0.0.0-stub' );

/**
 * Stub of WP Rocket's option reader: Delay JavaScript execution is on.
 *
 * @param string $key     Option key.
 * @param mixed  $default Default.
 * @return mixed
 */
function get_rocket_option( $key, $default = false ) {
	return 'delay_js' === $key ? 1 : $default;
}
