<?php
/**
 * Settings page (Settings → Rate 1).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Connect button (Rate1_Connector_Connect), or site key and secret pasted by hand; status of the connection.
 */
class Rate1_Connector_Admin {

	/** Settings page slug. */
	const PAGE = 'rate1-connector';

	/** Action name for admin-post.php, also the nonce action. */
	const ACTION = 'rate1_connector_save';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'save' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( RATE1_CONNECTOR_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Add the page under Settings.
	 */
	public static function menu() {
		add_options_page(
			__( 'Rate 1', 'rate1-connector' ),
			__( 'Rate 1', 'rate1-connector' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * "Settings" link on the Plugins screen.
	 *
	 * @param string[] $links Links.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		array_unshift(
			$links,
			'<a href="' . esc_url( self::page_url() ) . '">' . esc_html__( 'Settings', 'rate1-connector' ) . '</a>'
		);
		return $links;
	}

	/**
	 * URL of the settings page.
	 *
	 * @return string
	 */
	public static function page_url() {
		return admin_url( 'options-general.php?page=' . self::PAGE );
	}

	/**
	 * Handle the settings form (admin-post.php). An empty secret field keeps the stored secret.
	 */
	public static function save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to change these settings.', 'rate1-connector' ), 403 );
		}
		check_admin_referer( self::ACTION );

		$errors = array();

		$key = isset( $_POST['rate1_site_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['rate1_site_key'] ) ) ) : '';
		if ( '' === $key ) {
			update_option( Rate1_Connector_Options::SITE_KEY, '' );
		} elseif ( Rate1_Connector_Options::is_valid_key( $key ) ) {
			update_option( Rate1_Connector_Options::SITE_KEY, $key );
		} else {
			$errors[] = 'key';
		}

		$secret = isset( $_POST['rate1_site_secret'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['rate1_site_secret'] ) ) ) : '';
		if ( ! empty( $_POST['rate1_remove_secret'] ) ) {
			update_option( Rate1_Connector_Options::SITE_SECRET, '', false );
		} elseif ( '' !== $secret ) {
			if ( Rate1_Connector_Options::is_valid_secret( $secret ) ) {
				update_option( Rate1_Connector_Options::SITE_SECRET, $secret, false );
			} else {
				$errors[] = 'secret';
			}
		}

		update_option( Rate1_Connector_Options::EXCLUDE_EDITORS, empty( $_POST['rate1_exclude_editors'] ) ? '0' : '1' );

		Rate1_Connector_Hello::send( 'settings' );

		$args = array( 'rate1_saved' => '1' );
		if ( $errors ) {
			$args['rate1_errors'] = implode( ',', $errors );
		}
		wp_safe_redirect( add_query_arg( $args, self::page_url() ) );
		exit;
	}

	/**
	 * Render the settings page. Never prints the secret.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- Display-only flags set by our own redirect after a nonce-checked save.
		$saved   = isset( $_GET['rate1_saved'] );
		$errors  = isset( $_GET['rate1_errors'] ) ? explode( ',', sanitize_text_field( wp_unslash( $_GET['rate1_errors'] ) ) ) : array();
		$connect = isset( $_GET['rate1_connect'] ) ? sanitize_key( wp_unslash( $_GET['rate1_connect'] ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Recommended

		$key        = (string) get_option( Rate1_Connector_Options::SITE_KEY, '' );
		$has_secret = '' !== Rate1_Connector_Options::site_secret();
		$exclude    = Rate1_Connector_Options::exclude_editors();
		$hello      = get_option( Rate1_Connector_Options::LAST_HELLO );
		$last_send  = get_option( Rate1_Connector_Options::LAST_SEND );
		$queue      = Rate1_Connector_Sender::queue();
		$dropped    = (int) get_option( Rate1_Connector_Options::DROPPED, 0 );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Rate 1', 'rate1-connector' ); ?></h1>

			<?php if ( $saved && ! $errors ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Settings saved.', 'rate1-connector' ); ?></p></div>
			<?php endif; ?>
			<?php if ( in_array( 'key', $errors, true ) ) : ?>
				<div class="notice notice-error"><p><?php esc_html_e( 'The site key was not saved: it must look like pk_ followed by 24 letters and digits.', 'rate1-connector' ); ?></p></div>
			<?php endif; ?>
			<?php if ( in_array( 'secret', $errors, true ) ) : ?>
				<div class="notice notice-error"><p><?php esc_html_e( 'The site secret was not saved: it must look like sk_ followed by 40 letters and digits.', 'rate1-connector' ); ?></p></div>
			<?php endif; ?>

			<?php self::render_connect_notice( $connect ); ?>

			<h2><?php esc_html_e( 'Connect', 'rate1-connector' ); ?></h2>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( Rate1_Connector_Connect::START ); ?>" />
				<?php wp_nonce_field( Rate1_Connector_Connect::START, Rate1_Connector_Connect::NONCE_FIELD, true ); ?>
				<p>
					<button type="submit" class="button button-primary">
						<?php echo $has_secret ? esc_html__( 'Reconnect to Rate 1', 'rate1-connector' ) : esc_html__( 'Connect to Rate 1', 'rate1-connector' ); ?>
					</button>
					<span class="description">
						<?php
						/* translators: %s: Rate 1 dashboard host */
						echo esc_html( sprintf( __( 'Opens the Rate 1 dashboard (%s) to choose the website. Rate 1 then sends the site key and secret back here.', 'rate1-connector' ), (string) wp_parse_url( Rate1_Connector_Connect::app_url(), PHP_URL_HOST ) ) );
						?>
					</span>
				</p>
			</form>
			<p class="description"><?php esc_html_e( 'Or copy the site key and site secret from the Rate 1 dashboard into the fields below.', 'rate1-connector' ); ?></p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION ); ?>" />
				<?php wp_nonce_field( self::ACTION ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="rate1_site_key"><?php esc_html_e( 'Site key', 'rate1-connector' ); ?></label></th>
						<td>
							<input type="text" id="rate1_site_key" name="rate1_site_key" class="regular-text code" value="<?php echo esc_attr( $key ); ?>" placeholder="pk_…" autocomplete="off" spellcheck="false" />
							<p class="description"><?php esc_html_e( 'Public. It appears in your pages’ HTML.', 'rate1-connector' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="rate1_site_secret"><?php esc_html_e( 'Site secret', 'rate1-connector' ); ?></label></th>
						<td>
							<input type="password" id="rate1_site_secret" name="rate1_site_secret" class="regular-text code" value="" placeholder="<?php echo $has_secret ? esc_attr__( 'Saved. Leave empty to keep it.', 'rate1-connector' ) : 'sk_…'; ?>" autocomplete="new-password" spellcheck="false" />
							<p class="description">
								<?php
								if ( $has_secret ) {
									esc_html_e( 'A secret is saved. It is only sent to the Rate 1 collector and is never shown again.', 'rate1-connector' );
								} else {
									esc_html_e( 'No secret saved yet. Form submissions are reported only when a secret is saved.', 'rate1-connector' );
								}
								?>
							</p>
							<?php if ( $has_secret ) : ?>
								<p><label><input type="checkbox" name="rate1_remove_secret" value="1" /> <?php esc_html_e( 'Remove the saved secret', 'rate1-connector' ); ?></label></p>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Internal traffic', 'rate1-connector' ); ?></th>
						<td>
							<label><input type="checkbox" name="rate1_exclude_editors" value="1" <?php checked( $exclude ); ?> /> <?php esc_html_e( 'Don’t load the tracking tag for logged-in users who can edit posts', 'rate1-connector' ); ?></label>
						</td>
					</tr>
				</table>
				<?php submit_button( __( 'Save and check connection', 'rate1-connector' ) ); ?>
			</form>

			<h2><?php esc_html_e( 'Status', 'rate1-connector' ); ?></h2>
			<table class="widefat striped" style="max-width:48em">
				<tbody>
					<tr>
						<th scope="row"><?php esc_html_e( 'Tracking tag', 'rate1-connector' ); ?></th>
						<td><?php echo '' !== Rate1_Connector_Options::site_key() ? esc_html__( 'Printed in the head of every front-end page.', 'rate1-connector' ) : esc_html__( 'Not printed: no valid site key.', 'rate1-connector' ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Last hello', 'rate1-connector' ); ?></th>
						<td><?php echo esc_html( self::describe_hello( $hello ) ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Tag found on homepage', 'rate1-connector' ); ?></th>
						<td><?php echo esc_html( self::describe_head( $hello ) ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Last form request sent', 'rate1-connector' ); ?></th>
						<td><?php echo esc_html( self::describe_send( $last_send ) ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Waiting for retry', 'rate1-connector' ); ?></th>
						<td><?php echo esc_html( number_format_i18n( count( $queue ) ) ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Dropped after retries', 'rate1-connector' ); ?></th>
						<td><?php echo esc_html( number_format_i18n( $dropped ) ); ?></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Collector', 'rate1-connector' ); ?></th>
						<td><code><?php echo esc_html( Rate1_Connector_Options::collect_url() ); ?></code></td>
					</tr>
				</tbody>
			</table>
		</div>
		<?php
	}

	/**
	 * Notice for the outcome of "Connect to Rate 1" (see Rate1_Connector_Connect::complete()).
	 *
	 * @param string $result ok, cancelled, expired, failed, bad_response or ''.
	 */
	private static function render_connect_notice( $result ) {
		$notices = array(
			'ok'           => array( 'success', __( 'Connected to Rate 1. The site key and secret are saved.', 'rate1-connector' ) ),
			'cancelled'    => array( 'warning', __( 'Connecting was cancelled in the Rate 1 dashboard. Nothing was changed.', 'rate1-connector' ) ),
			'expired'      => array( 'error', __( 'The connection attempt expired or was not started from this page. Click Connect to Rate 1 again.', 'rate1-connector' ) ),
			'failed'       => array( 'error', __( 'Rate 1 did not accept the connection (the link is valid for 5 minutes and works once). Click Connect to Rate 1 again.', 'rate1-connector' ) ),
			'bad_response' => array( 'error', __( 'Rate 1 sent an unexpected answer. Nothing was changed; try again later.', 'rate1-connector' ) ),
		);
		if ( ! isset( $notices[ $result ] ) ) {
			return;
		}
		printf(
			'<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
			esc_attr( $notices[ $result ][0] ),
			esc_html( $notices[ $result ][1] )
		);
	}

	/**
	 * Human-readable time.
	 *
	 * @param int $timestamp Unix time.
	 * @return string
	 */
	private static function when( $timestamp ) {
		return wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), (int) $timestamp );
	}

	/**
	 * Describe the last hello.
	 *
	 * @param mixed $hello Stored outcome.
	 * @return string
	 */
	private static function describe_hello( $hello ) {
		if ( ! is_array( $hello ) || empty( $hello['at'] ) ) {
			return __( 'Not sent yet.', 'rate1-connector' );
		}
		$when = self::when( $hello['at'] );
		if ( empty( $hello['sent'] ) ) {
			/* translators: %s: date and time */
			return sprintf( __( 'Not sent (%s): no site secret saved.', 'rate1-connector' ), $when );
		}
		if ( ! empty( $hello['ok'] ) ) {
			/* translators: %s: date and time */
			return sprintf( __( 'OK, %s.', 'rate1-connector' ), $when );
		}
		if ( 401 === (int) $hello['code'] ) {
			/* translators: %s: date and time */
			return sprintf( __( 'Rejected (%s): the collector did not accept the site secret.', 'rate1-connector' ), $when );
		}
		/* translators: 1: date and time, 2: error code */
		return sprintf( __( 'Failed (%1$s): %2$s.', 'rate1-connector' ), $when, (string) $hello['error'] );
	}

	/**
	 * Describe the homepage tag check of the last hello.
	 *
	 * @param mixed $hello Stored outcome.
	 * @return string
	 */
	private static function describe_head( $hello ) {
		if ( ! is_array( $hello ) || ! isset( $hello['head_hook_ok'] ) ) {
			return __( 'Not checked yet.', 'rate1-connector' );
		}
		if ( $hello['head_hook_ok'] ) {
			return __( 'Yes.', 'rate1-connector' );
		}
		/* translators: %s: error code */
		return sprintf( __( 'No (%s). If you use a page cache, clear it and save again.', 'rate1-connector' ), (string) $hello['head_hook_error'] );
	}

	/**
	 * Describe the last POST /v1/r.
	 *
	 * @param mixed $send Stored outcome.
	 * @return string
	 */
	private static function describe_send( $send ) {
		if ( ! is_array( $send ) || empty( $send['at'] ) ) {
			return __( 'None yet.', 'rate1-connector' );
		}
		$code = (int) $send['code'];
		/* translators: 1: date and time, 2: HTTP status or "no response" */
		return sprintf( __( '%1$s, %2$s', 'rate1-connector' ), self::when( $send['at'] ), $code ? 'HTTP ' . $code : __( 'no response', 'rate1-connector' ) );
	}
}
