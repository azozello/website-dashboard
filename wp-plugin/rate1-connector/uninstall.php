<?php
/**
 * Uninstall: remove every option, cron event and the retry queue.
 *
 * @package Rate1_Connector
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/class-rate1-connector-options.php';

/**
 * Remove the plugin's data from the current site.
 */
function rate1_connector_uninstall_site() {
	foreach ( Rate1_Connector_Options::all() as $option ) {
		delete_option( $option );
	}
	foreach ( Rate1_Connector_Options::cron_hooks() as $hook ) {
		wp_clear_scheduled_hook( $hook );
	}
}

if ( is_multisite() ) {
	$rate1_connector_site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);
	foreach ( $rate1_connector_site_ids as $rate1_connector_site_id ) {
		switch_to_blog( $rate1_connector_site_id );
		rate1_connector_uninstall_site();
		restore_current_blog();
	}
} else {
	rate1_connector_uninstall_site();
}
