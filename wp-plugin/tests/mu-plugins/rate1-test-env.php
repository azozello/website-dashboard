<?php
/**
 * Test environment helpers for the rate1-connector integration tests.
 * Mounted as a must-use plugin into the Docker WordPress only. Never shipped.
 *
 * @package Rate1_Connector_Tests
 */

// No mail server in the container: report every mail as sent so CF7 ends in "mail_sent".
add_filter( 'pre_wp_mail', '__return_true' );

// Simulate a CF7 honeypot add-on: a filled "hp-trap" field is spam, logged with agent "honeypot".
add_filter(
	'wpcf7_spam',
	function ( $spam, $submission = null ) {
		if ( ! $spam && ! empty( $_POST['hp-trap'] ) && is_object( $submission ) && method_exists( $submission, 'add_spam_log' ) ) {
			$submission->add_spam_log(
				array(
					'agent'  => 'honeypot',
					'reason' => 'trap field filled',
				)
			);
			return true;
		}
		return $spam;
	},
	20,
	2
);

// Force the WP-Cron fallback (as on hosts without fastcgi_finish_request) when the test option is set.
add_filter(
	'rate1_connector_finish_request',
	function ( $allowed ) {
		return get_option( 'rate1_test_no_finish' ) ? false : $allowed;
	}
);

// Remove the r1.js tag (to test head_hook_ok = false) when the test option is set.
add_action(
	'wp_enqueue_scripts',
	function () {
		if ( get_option( 'rate1_test_strip_tag' ) ) {
			wp_dequeue_script( 'rate1-r1' );
		}
	},
	100
);

// Negative control: remove rate1-connector's cache plugin exclusions when the test option is set.
add_action(
	'plugins_loaded',
	function () {
		if ( ! get_option( 'rate1_test_no_exclusions' ) || ! class_exists( 'Rate1_Connector_Compat' ) ) {
			return;
		}
		$hooks = array(
			'rocket_delay_js_exclusions',
			'rocket_exclude_defer_js',
			'rocket_minify_excluded_external_js',
			'litespeed_optm_js_defer_exc',
			'litespeed_optm_gm_js_exc',
			'litespeed_optimize_js_excludes',
		);
		foreach ( $hooks as $hook ) {
			remove_filter( $hook, array( 'Rate1_Connector_Compat', 'add_needle' ) );
		}
		remove_filter( 'autoptimize_filter_js_exclude', array( 'Rate1_Connector_Compat', 'autoptimize_exclude' ) );
	},
	0
);
