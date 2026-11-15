<?php
/**
 * Plugin Name:       Rate 1 Connector
 * Description:       Adds the Rate 1 tracking tag to every page and reports form submissions (Contact Form 7, Elementor Pro, WPForms, Gravity Forms) to Rate 1 without sending any field values.
 * Version:           0.2.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Rate 1
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rate1-connector
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

define( 'RATE1_CONNECTOR_VERSION', '0.2.0' );
define( 'RATE1_CONNECTOR_FILE', __FILE__ );
define( 'RATE1_CONNECTOR_DIR', plugin_dir_path( __FILE__ ) );

if ( ! defined( 'RATE1_CONNECTOR_COLLECT_URL' ) ) {
	/*
	 * Base URL of the Rate 1 collector. Can be overridden in wp-config.php for
	 * tests only; production sites must use the default.
	 */
	define( 'RATE1_CONNECTOR_COLLECT_URL', 'https://collect.bazed.live' );
}

if ( ! defined( 'RATE1_CONNECTOR_APP_URL' ) ) {
	/*
	 * Base URL of the Rate 1 dashboard, used by "Connect to Rate 1". Can be overridden in wp-config.php for
	 * tests only; production sites must use the default.
	 */
	define( 'RATE1_CONNECTOR_APP_URL', 'https://app.bazed.live' );
}

require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-options.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-path.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-tag.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-sender.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-forms.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-compat.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-hello.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-admin.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-connect.php';
require_once RATE1_CONNECTOR_DIR . 'includes/class-rate1-connector-plugin.php';

register_activation_hook( __FILE__, array( 'Rate1_Connector_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Rate1_Connector_Plugin', 'deactivate' ) );

Rate1_Connector_Plugin::init();
