<?php
/**
 * Build the installable plugin zip: dist/rate1-connector-<version>.zip
 *
 *   php wp-plugin/build.php
 *
 * Only files under rate1-connector/ go into the zip (no tests, composer or dev files).
 */

$root   = __DIR__;
$src    = $root . '/rate1-connector';
$main   = file_get_contents( $src . '/rate1-connector.php' );
if ( ! preg_match( '/^\s*\*\s*Version:\s*(\S+)/m', $main, $m ) ) {
	fwrite( STDERR, "Version header not found\n" );
	exit( 1 );
}
$version = $m[1];
$readme  = file_get_contents( $src . '/readme.txt' );
if ( ! preg_match( '/^Stable tag:\s*' . preg_quote( $version, '/' ) . '\s*$/m', $readme ) ) {
	fwrite( STDERR, "readme.txt Stable tag does not match Version $version\n" );
	exit( 1 );
}
if ( false === strpos( $main, "define( 'RATE1_CONNECTOR_VERSION', '$version' );" ) ) {
	fwrite( STDERR, "RATE1_CONNECTOR_VERSION does not match Version $version\n" );
	exit( 1 );
}

$dist = $root . '/dist';
if ( ! is_dir( $dist ) ) {
	mkdir( $dist, 0777, true );
}
$zip_path = "$dist/rate1-connector-$version.zip";
if ( file_exists( $zip_path ) ) {
	unlink( $zip_path );
}

$zip = new ZipArchive();
if ( true !== $zip->open( $zip_path, ZipArchive::CREATE ) ) {
	fwrite( STDERR, "Cannot create $zip_path\n" );
	exit( 1 );
}
$files = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $src, FilesystemIterator::SKIP_DOTS ) );
$list  = array();
foreach ( $files as $file ) {
	$rel = str_replace( DIRECTORY_SEPARATOR, '/', substr( $file->getPathname(), strlen( $src ) + 1 ) );
	if ( preg_match( '#(^|/)\.#', $rel ) ) {
		continue; // No dotfiles.
	}
	$list[] = $rel;
}
sort( $list );
foreach ( $list as $rel ) {
	$zip->addFile( "$src/$rel", "rate1-connector/$rel" );
}
$zip->close();
echo "Built $zip_path (" . count( $list ) . " files)\n";
foreach ( $list as $rel ) {
	echo "  rate1-connector/$rel\n";
}
