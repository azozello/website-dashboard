<?php
/**
 * Form plugin hooks → POST /v1/r payloads (Data contract v1 §6).
 *
 * @package Rate1_Connector
 */

defined( 'ABSPATH' ) || exit;

/**
 * Hooks Contact Form 7, Elementor Pro, WPForms and Gravity Forms.
 *
 * Reads only the r1_pv and r1_path hidden fields and the form id. Never reads
 * or sends any other field, the visitor's IP address or user agent.
 */
class Rate1_Connector_Forms {

	/** Maximum forms per form plugin listed in the hello. */
	const LIST_LIMIT = 100;

	/**
	 * Request ids already issued in this request, keyed by "source:form_id".
	 *
	 * @var array<string, string>
	 */
	private static $rids = array();

	/**
	 * Register the form plugin hooks. Hooks of inactive plugins never fire.
	 */
	public static function init() {
		add_action( 'wpcf7_submit', array( __CLASS__, 'on_cf7_submit' ), 10, 2 );
		add_action( 'elementor_pro/forms/new_record', array( __CLASS__, 'on_elementor_new_record' ), 10, 2 );
		add_action( 'wpforms_process_complete', array( __CLASS__, 'on_wpforms_complete' ), 10, 4 );
		add_action( 'gform_after_submission', array( __CLASS__, 'on_gravity_after_submission' ), 10, 2 );
	}

	/**
	 * Contact Form 7: wpcf7_submit fires for every outcome; send only when the
	 * mail was sent (spam=false) or CF7 judged it spam (spam=true).
	 *
	 * @param object $contact_form WPCF7_ContactForm.
	 * @param array  $result       Submission result; 'status' is e.g. mail_sent, spam, validation_failed.
	 */
	public static function on_cf7_submit( $contact_form, $result ) {
		if ( ! is_object( $contact_form ) || ! method_exists( $contact_form, 'id' ) || ! is_array( $result ) ) {
			return;
		}
		$status = isset( $result['status'] ) ? $result['status'] : '';
		if ( 'mail_sent' === $status ) {
			self::record( 'cf7', (string) $contact_form->id(), false, null );
		} elseif ( 'spam' === $status ) {
			self::record( 'cf7', (string) $contact_form->id(), true, self::cf7_spam_reason() );
		}
	}

	/**
	 * Spam reason from CF7's spam log: "honeypot" if a honeypot agent flagged it, else "plugin".
	 *
	 * @return string
	 */
	private static function cf7_spam_reason() {
		if ( class_exists( 'WPCF7_Submission' ) ) {
			$submission = WPCF7_Submission::get_instance();
			if ( is_object( $submission ) && method_exists( $submission, 'get_spam_log' ) ) {
				foreach ( (array) $submission->get_spam_log() as $entry ) {
					if ( is_array( $entry ) && isset( $entry['agent'] ) && false !== stripos( (string) $entry['agent'], 'honeypot' ) ) {
						return 'honeypot';
					}
				}
			}
		}
		return 'plugin';
	}

	/**
	 * Elementor Pro: a new record was saved (after validation and actions).
	 * Elementor rejects spam (honeypot, reCAPTCHA) before this hook, so it never
	 * sees spam: spam is always false here.
	 *
	 * @param object $record  ElementorPro\Modules\Forms\Classes\Form_Record.
	 * @param object $handler Ajax handler (unused).
	 */
	public static function on_elementor_new_record( $record, $handler = null ) {
		unset( $handler );
		if ( ! is_object( $record ) || ! method_exists( $record, 'get_form_settings' ) ) {
			return;
		}
		$id = $record->get_form_settings( 'id' );
		if ( is_scalar( $id ) ) {
			self::record( 'elementor', (string) $id, false, null );
		}
	}

	/**
	 * WPForms: the entry was processed. WPForms stops before this hook for spam.
	 *
	 * @param array $fields    Field values (never read).
	 * @param array $entry     Raw entry (never read).
	 * @param array $form_data Form settings; only 'id' is read.
	 * @param int   $entry_id  Entry id (0 in WPForms Lite).
	 */
	public static function on_wpforms_complete( $fields, $entry, $form_data, $entry_id = 0 ) {
		unset( $fields, $entry, $entry_id );
		if ( is_array( $form_data ) && isset( $form_data['id'] ) && is_scalar( $form_data['id'] ) ) {
			self::record( 'wpforms', (string) $form_data['id'], false, null );
		}
	}

	/**
	 * Gravity Forms: fires after every submission, including ones it marked as spam.
	 * The entry id makes the rid stable.
	 *
	 * @param array $entry Entry; only 'id' and 'status' are read.
	 * @param array $form  Form; only 'id' is read.
	 */
	public static function on_gravity_after_submission( $entry, $form ) {
		if ( ! is_array( $entry ) || ! is_array( $form ) || ! isset( $form['id'] ) || ! is_scalar( $form['id'] ) ) {
			return;
		}
		$spam     = isset( $entry['status'] ) && 'spam' === $entry['status'];
		$entry_id = isset( $entry['id'] ) && is_scalar( $entry['id'] ) ? (string) $entry['id'] : '';
		self::record( 'gravity', (string) $form['id'], $spam, $spam ? 'plugin' : null, '' !== $entry_id && '0' !== $entry_id ? $entry_id : null );
	}

	/**
	 * Build the payload and hand it to the sender.
	 *
	 * @param string      $source      cf7, elementor, wpforms, gravity.
	 * @param string      $form_id     Form id in its plugin.
	 * @param bool        $spam        Spam verdict of the form plugin.
	 * @param string|null $spam_reason honeypot, plugin, too_fast or null.
	 * @param string|null $unique      Stable submission id (e.g. entry id); default a UUID.
	 * @return array|null The payload, or null if not sent.
	 */
	public static function record( $source, $form_id, $spam, $spam_reason, $unique = null ) {
		if ( '' === Rate1_Connector_Options::site_secret() ) {
			return null;
		}
		$payload = self::build_payload( $source, $form_id, $spam, $spam_reason, $unique );
		if ( null !== $payload ) {
			Rate1_Connector_Sender::add( $payload );
		}
		return $payload;
	}

	/**
	 * Build a POST /v1/r body. Contains no field values.
	 *
	 * @param string      $source      Source.
	 * @param string      $form_id     Form id.
	 * @param bool        $spam        Spam verdict.
	 * @param string|null $spam_reason Spam reason.
	 * @param string|null $unique      Stable submission id; default a UUID.
	 * @return array|null
	 */
	public static function build_payload( $source, $form_id, $spam, $spam_reason, $unique = null ) {
		$form_id = Rate1_Connector_Path::truncate( trim( (string) preg_replace( '/[\x00-\x1F\x7F]/', '', (string) $form_id ) ), 100 );
		if ( '' === $form_id ) {
			return null;
		}
		$spam = (bool) $spam;
		return array(
			'v'           => 1,
			'rid'         => self::rid( $source, $form_id, $unique ),
			'ts'          => (int) floor( microtime( true ) * 1000 ),
			'pv'          => self::read_pv(),
			'path'        => self::read_path(),
			'channel'     => 'form',
			'source'      => $source,
			'form_id'     => $form_id,
			'spam'        => $spam,
			'spam_reason' => $spam && in_array( $spam_reason, array( 'honeypot', 'plugin', 'too_fast' ), true ) ? $spam_reason : ( $spam ? 'plugin' : null ),
		);
	}

	/**
	 * Request id "<source>:<form_id>:<uuid4 or entry id>", issued once per form
	 * per request so a hook that fires twice doesn't create a second request.
	 *
	 * @param string      $source  Source.
	 * @param string      $form_id Form id.
	 * @param string|null $unique  Stable submission id.
	 * @return string At most 120 characters.
	 */
	public static function rid( $source, $form_id, $unique = null ) {
		$memo = $source . ':' . $form_id;
		if ( isset( self::$rids[ $memo ] ) ) {
			return self::$rids[ $memo ];
		}
		$suffix = null !== $unique && '' !== $unique ? Rate1_Connector_Path::truncate( (string) $unique, 40 ) : wp_generate_uuid4();
		$room   = 120 - strlen( $source ) - strlen( $suffix ) - 2;
		$rid    = $source . ':' . substr( $form_id, 0, max( 1, $room ) ) . ':' . $suffix;
		if ( ! preg_match( '//u', $rid ) ) {
			$rid = $source . ':' . md5( $form_id ) . ':' . $suffix;
		}
		self::$rids[ $memo ] = $rid;
		return $rid;
	}

	/**
	 * Forget issued request ids (tests only).
	 */
	public static function reset() {
		self::$rids = array();
	}

	// phpcs:disable WordPress.Security.NonceVerification.Missing -- Read-only access to the two r1.js hidden fields inside a form plugin's own submit handler (which does its own nonce/spam checks); values are validated strictly and never stored or echoed.

	/**
	 * Page token from the r1_pv hidden field, or null.
	 *
	 * @return string|null
	 */
	public static function read_pv() {
		if ( ! isset( $_POST['r1_pv'] ) || ! is_string( $_POST['r1_pv'] ) ) {
			return null;
		}
		$pv = sanitize_text_field( wp_unslash( $_POST['r1_pv'] ) );
		return 1 === preg_match( '/^[0-9A-Za-z]{16}$/', $pv ) ? $pv : null;
	}

	/**
	 * Path from the r1_path hidden field; else the normalised HTTP Referer path; else null.
	 *
	 * @return string|null
	 */
	public static function read_path() {
		if ( isset( $_POST['r1_path'] ) && is_string( $_POST['r1_path'] ) ) {
			// Not sanitize_text_field(): it would strip "%xx" sequences that are part of a normalised path.
			// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Validated by clean_field(): valid UTF-8, starts with "/", control characters removed, max 512.
			$path = Rate1_Connector_Path::clean_field( wp_unslash( $_POST['r1_path'] ) );
			if ( null !== $path ) {
				return $path;
			}
		}
		return Rate1_Connector_Path::from_referer();
	}

	// phpcs:enable WordPress.Security.NonceVerification.Missing

	/**
	 * Forms of every active form plugin, for the hello.
	 *
	 * @return array[] Items { source, id, title }.
	 */
	public static function list_forms() {
		$forms = array();
		if ( defined( 'WPCF7_VERSION' ) ) {
			$forms = array_merge( $forms, self::forms_from_posts( 'cf7', 'wpcf7_contact_form' ) );
		}
		if ( defined( 'ELEMENTOR_PRO_VERSION' ) ) {
			$forms = array_merge( $forms, self::elementor_forms() );
		}
		if ( defined( 'WPFORMS_VERSION' ) || function_exists( 'wpforms' ) ) {
			$forms = array_merge( $forms, self::forms_from_posts( 'wpforms', 'wpforms' ) );
		}
		if ( class_exists( 'GFAPI' ) && is_callable( array( 'GFAPI', 'get_forms' ) ) ) {
			$forms = array_merge( $forms, self::gravity_forms() );
		}
		return $forms;
	}

	/**
	 * Forms stored as a custom post type (CF7, WPForms).
	 *
	 * @param string $source    Source.
	 * @param string $post_type Post type.
	 * @return array[]
	 */
	private static function forms_from_posts( $source, $post_type ) {
		$posts = get_posts(
			array(
				'post_type'   => $post_type,
				'post_status' => 'publish',
				'numberposts' => self::LIST_LIMIT,
				'orderby'     => 'ID',
				'order'       => 'ASC',
			)
		);
		$out   = array();
		foreach ( $posts as $post ) {
			$out[] = self::form_item( $source, $post->ID, $post->post_title );
		}
		return $out;
	}

	/**
	 * Gravity Forms forms (active, not trashed).
	 *
	 * @return array[]
	 */
	private static function gravity_forms() {
		$out   = array();
		$forms = GFAPI::get_forms( true, false );
		foreach ( is_array( $forms ) ? array_slice( $forms, 0, self::LIST_LIMIT ) : array() as $form ) {
			if ( is_array( $form ) && isset( $form['id'] ) ) {
				$out[] = self::form_item( 'gravity', $form['id'], isset( $form['title'] ) ? $form['title'] : '' );
			}
		}
		return $out;
	}

	/**
	 * Elementor Pro forms: scan published documents' _elementor_data for
	 * widgetType "form". The form id is the element id; the title its form_name.
	 *
	 * @return array[]
	 */
	private static function elementor_forms() {
		$types = array_values( array_unique( array_merge( get_post_types( array( 'public' => true ) ), array( 'elementor_library' ) ) ) );
		$ids   = get_posts(
			array(
				'post_type'   => $types,
				'post_status' => 'publish',
				'numberposts' => self::LIST_LIMIT,
				'fields'      => 'ids',
				// Runs only for the hello (activation, settings save, daily), capped at 100 documents.
				'meta_query'  => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					array(
						'key'     => '_elementor_data',
						'value'   => '"widgetType":"form"',
						'compare' => 'LIKE',
					),
				),
			)
		);
		$found = array();
		foreach ( $ids as $post_id ) {
			$data = get_post_meta( $post_id, '_elementor_data', true );
			if ( is_string( $data ) ) {
				$data = json_decode( $data, true );
			}
			if ( is_array( $data ) ) {
				self::walk_elementor( $data, $found );
			}
			if ( count( $found ) >= self::LIST_LIMIT ) {
				break;
			}
		}
		return array_values( $found );
	}

	/**
	 * Collect form widgets from an Elementor element tree.
	 *
	 * @param array $elements Elements.
	 * @param array $found    Found forms keyed by element id (by reference).
	 * @param int   $depth    Recursion depth.
	 */
	public static function walk_elementor( array $elements, array &$found, $depth = 0 ) {
		if ( $depth > 20 ) {
			return;
		}
		foreach ( $elements as $el ) {
			if ( ! is_array( $el ) || count( $found ) >= self::LIST_LIMIT ) {
				continue;
			}
			if ( isset( $el['widgetType'], $el['id'] ) && 'form' === $el['widgetType'] && is_scalar( $el['id'] ) ) {
				$title                       = isset( $el['settings']['form_name'] ) && is_string( $el['settings']['form_name'] ) ? $el['settings']['form_name'] : '';
				$found[ (string) $el['id'] ] = self::form_item( 'elementor', $el['id'], $title );
			}
			if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
				self::walk_elementor( $el['elements'], $found, $depth + 1 );
			}
		}
	}

	/**
	 * One hello forms item.
	 *
	 * @param string     $source Source.
	 * @param int|string $id     Id.
	 * @param string     $title  Title.
	 * @return array
	 */
	private static function form_item( $source, $id, $title ) {
		return array(
			'source' => $source,
			'id'     => (string) $id,
			'title'  => Rate1_Connector_Path::truncate( wp_strip_all_tags( html_entity_decode( (string) $title, ENT_QUOTES, 'UTF-8' ) ), 200 ),
		);
	}
}
