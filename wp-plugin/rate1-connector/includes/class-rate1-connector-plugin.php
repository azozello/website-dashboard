<?php
/**
 * Bootstrap, activation and deactivation.
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Wires the components together.
 */
class Rate1_Connector_Plugin {

	/**
	 * Register all hooks. Called at plugin load.
	 */
	public static function init() {
		Rate1_Connector_Tag::init();
		Rate1_Connector_Sender::init();
		Rate1_Connector_Forms::init();
		Rate1_Connector_Compat::init();
		Rate1_Connector_Hello::init();
		if ( is_admin() ) {
			Rate1_Connector_Admin::init();
			Rate1_Connector_Connect::init();
		}
		add_action( 'activated_plugin', array( __CLASS__, 'activated' ) );
		add_action( 'admin_init', array( __CLASS__, 'ensure_schedule' ) );
	}

	/**
	 * Activation: create options (secret and queue with autoload off) and the daily hello.
	 */
	public static function activate() {
		add_option( Rate1_Connector_Options::SITE_KEY, '' );
		add_option( Rate1_Connector_Options::SITE_SECRET, '', '', false );
		add_option( Rate1_Connector_Options::EXCLUDE_EDITORS, '1' );
		add_option( Rate1_Connector_Options::QUEUE, array(), '', false );
		add_option( Rate1_Connector_Options::DROPPED, 0, '', false );
		self::ensure_schedule();
		Rate1_Connector_Sender::schedule_next( Rate1_Connector_Sender::queue() );
	}

	/**
	 * After activation (the plugin is now in active_plugins, so the homepage
	 * check sees the tag): send the hello. Skipped while no secret is saved.
	 *
	 * @param string $plugin Plugin basename.
	 */
	public static function activated( $plugin ) {
		if ( plugin_basename( RATE1_CONNECTOR_FILE ) === $plugin ) {
			Rate1_Connector_Hello::send( 'activation' );
		}
	}

	/**
	 * Make sure the daily hello is scheduled.
	 */
	public static function ensure_schedule() {
		if ( ! wp_next_scheduled( Rate1_Connector_Options::CRON_HELLO ) ) {
			wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', Rate1_Connector_Options::CRON_HELLO );
		}
	}

	/**
	 * Deactivation: remove cron events. Options and the queue stay until uninstall.
	 */
	public static function deactivate() {
		foreach ( Rate1_Connector_Options::cron_hooks() as $hook ) {
			wp_clear_scheduled_hook( $hook );
		}
	}
}
