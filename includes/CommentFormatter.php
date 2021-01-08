<?php

namespace MediaWiki\Extension\DiscussionTools;

use DOMElement;
use Language;
use Wikimedia\Parsoid\Utils\DOMCompat;
use Wikimedia\Parsoid\Utils\DOMUtils;

class CommentFormatter {

	/**
	 * Get a comment parser object for a DOM element
	 *
	 * This method exists so it can mocked in tests.
	 *
	 * @param DOMElement $container
	 * @return CommentParser
	 */
	protected static function getParser( DOMElement $container ) : CommentParser {
		return CommentParser::newFromGlobalState( $container );
	}

	/**
	 * Add reply links to some HTML
	 *
	 * @param string $html HTML
	 * @param Language $lang Interface language
	 * @return string HTML with reply links
	 */
	public static function addReplyLinks( string $html, Language $lang ) : string {
		// The output of this method can end up in the HTTP cache (Varnish). Avoid changing it;
		// and when doing so, ensure that frontend code can handle both the old and new outputs.
		// See controller#init in JS.

		$doc = DOMUtils::parseHTML( $html );
		$doc->preserveWhiteSpace = false;

		$container = $doc->getElementsByTagName( 'body' )->item( 0 );
		if ( !( $container instanceof DOMElement ) ) {
			return $html;
		}

		$parser = static::getParser( $container );
		$threadItems = $parser->getThreadItems();

		foreach ( $threadItems as $threadItem ) {
			// TODO: Consider not attaching JSON data to the DOM.
			// Create a dummy node to attach data to.
			if ( $threadItem instanceof HeadingItem && $threadItem->isPlaceholderHeading() ) {
				$node = $doc->createElement( 'span' );
				$container->firstChild->insertBefore( $node, $container->firstChild->firstChild );
				$threadItem->setRange( new ImmutableRange( $node, 0, $node, 0 ) );
			}

			// And start and end markers to range
			$id = $threadItem->getId();
			$range = $threadItem->getRange();
			$startMarker = $doc->createElement( 'span' );
			$startMarker->setAttribute( 'data-mw-comment-start', $id );
			$endMarker = $doc->createElement( 'span' );
			$endMarker->setAttribute( 'data-mw-comment-end', $id );

			// Extend the range if the start or end is inside an element which can't have element children.
			// (There may be other problematic elements... but this seems like a good start.)
			if ( CommentUtils::cantHaveElementChildren( $range->startContainer ) ) {
				$range = $range->setStart(
					$range->startContainer->parentNode,
					CommentUtils::childIndexOf( $range->startContainer )
				);
			}
			if ( CommentUtils::cantHaveElementChildren( $range->endContainer ) ) {
				$range = $range->setEnd(
					$range->endContainer->parentNode,
					CommentUtils::childIndexOf( $range->endContainer ) + 1
				);
			}

			$range->setStart( $range->endContainer, $range->endOffset )->insertNode( $endMarker );
			$range->insertNode( $startMarker );

			$itemData = $threadItem->jsonSerialize();
			$itemJSON = json_encode( $itemData );

			if ( $threadItem instanceof HeadingItem ) {
				$threadItem->getRange()->endContainer->setAttribute( 'data-mw-comment', $itemJSON );
			} elseif ( $threadItem instanceof CommentItem ) {
				$replyLinkButtons = $doc->createElement( 'span' );
				$replyLinkButtons->setAttribute( 'class', 'dt-init-replylink-buttons' );

				// Reply
				$replyLink = $doc->createElement( 'a' );
				$replyLink->setAttribute( 'class', 'dt-init-replylink-reply' );
				$replyLink->setAttribute( 'role', 'button' );
				$replyLink->setAttribute( 'tabindex', '0' );
				$replyLink->setAttribute( 'data-mw-comment', $itemJSON );
				$replyLink->nodeValue = wfMessage( 'discussiontools-replylink' )->inLanguage( $lang )->text();

				$bracket = $doc->createElement( 'span' );
				$bracket->setAttribute( 'class', 'dt-init-replylink-bracket' );
				$bracketLeft = $bracket->cloneNode( false );
				$bracketLeft->nodeValue = '[';
				$bracketRight = $bracket->cloneNode( false );
				$bracketRight->nodeValue = ']';

				$replyLinkButtons->appendChild( $bracketLeft );
				$replyLinkButtons->appendChild( $replyLink );
				$replyLinkButtons->appendChild( $bracketRight );

				CommentModifier::addReplyLink( $threadItem, $replyLinkButtons );
			}
		}

		$docElement = $doc->getElementsByTagName( 'body' )->item( 0 );
		if ( !( $docElement instanceof DOMElement ) ) {
			return $html;
		}
		return DOMCompat::getInnerHTML( $docElement );
	}

}
