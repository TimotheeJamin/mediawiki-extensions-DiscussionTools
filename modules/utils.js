'use strict';
/* global $:off */

/**
 * @external ThreadItem
 */

/**
 * @constant
 */
var NEW_TOPIC_COMMENT_ID = 'new|' + mw.config.get( 'wgRelevantPageName' );

/**
 * @param {Node} node
 * @return {boolean} Node is a block element
 */
function isBlockElement( node ) {
	return node instanceof HTMLElement && ve.isBlockElement( node );
}

var solTransparentLinkRegexp = /(?:^|\s)mw:PageProp\/(?:Category|redirect|Language)(?=$|\s)/;

/**
 * @param {Node} node
 * @return {boolean} Node is considered a rendering-transparent node in Parsoid
 */
function isRenderingTransparentNode( node ) {
	return (
		node.nodeType === Node.COMMENT_NODE ||
		node.nodeType === Node.ELEMENT_NODE && (
			node.tagName.toLowerCase() === 'meta' ||
			(
				node.tagName.toLowerCase() === 'link' &&
				solTransparentLinkRegexp.test( node.getAttribute( 'rel' ) || '' )
			) ||
			// Empty inline templates, e.g. tracking templates
			(
				node.tagName.toLowerCase() === 'span' &&
				( node.getAttribute( 'typeof' ) || '' ).split( ' ' ).indexOf( 'mw:Transclusion' ) !== -1 &&
				// eslint-disable-next-line no-use-before-define
				!htmlTrim( node.innerHTML )
			)
		)
	);
}

// Elements which can't have element children (but some may have text content).
// https://html.spec.whatwg.org/#elements-2
var noElementChildrenElementTypes = [
	// Void elements
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
	// Raw text elements
	'script', 'style',
	// Escapable raw text elements
	'textarea', 'title',
	// Treated like text when scripting is enabled in the parser
	// https://html.spec.whatwg.org/#the-noscript-element
	'noscript'
];

/**
 * @param {Node} node
 * @return {boolean} If true, node can't have element children. If false, it's complicated.
 */
function cantHaveElementChildren( node ) {
	return (
		node.nodeType === Node.COMMENT_NODE ||
		node.nodeType === Node.ELEMENT_NODE &&
			noElementChildrenElementTypes.indexOf( node.tagName.toLowerCase() ) !== -1
	);
}

/**
 * Get the index of a node in its parentNode's childNode list
 *
 * @param {Node} child
 * @return {number} Index in parentNode's childNode list
 */
function childIndexOf( child ) {
	var i = 0;
	while ( ( child = child.previousSibling ) ) {
		i++;
	}
	return i;
}

/**
 * Check whether a Node contains (is an ancestor of) another Node (or is the same node)
 *
 * @param {Node} ancestor
 * @param {Node} descendant
 * @return {boolean}
 */
function contains( ancestor, descendant ) {
	// Support: IE 11
	// Node#contains is only supported on HTMLElement nodes. Otherwise we could just use
	// `ancestor.contains( descendant )`.
	return ancestor === descendant ||
		// eslint-disable-next-line no-bitwise
		ancestor.compareDocumentPosition( descendant ) & Node.DOCUMENT_POSITION_CONTAINED_BY;
}

/**
 * Find closest ancestor element using one of the given tag names.
 *
 * @param {Node} node
 * @param {string[]} tagNames
 * @return {HTMLElement|null}
 */
function closestElement( node, tagNames ) {
	do {
		if (
			node.nodeType === Node.ELEMENT_NODE &&
			tagNames.indexOf( node.tagName.toLowerCase() ) !== -1
		) {
			return node;
		}
		node = node.parentNode;
	} while ( node );
	return null;
}

/**
 * Find the transclusion node which rendered the current node, if it exists.
 *
 * 1. Find the closest ancestor with an 'about' attribute
 * 2. Find the main node of the about-group (first sibling with the same 'about' attribute)
 * 3. If this is an mw:Transclusion node, return it; otherwise, go to step 1
 *
 * @param {Node} node
 * @return {HTMLElement|null} Translcusion node, null if not found
 */
function getTranscludedFromElement( node ) {
	while ( node ) {
		// 1.
		if (
			node.nodeType === Node.ELEMENT_NODE &&
			node.getAttribute( 'about' ) &&
			/^#mwt\d+$/.test( node.getAttribute( 'about' ) )
		) {
			var about = node.getAttribute( 'about' );

			// 2.
			while (
				node.previousSibling &&
				node.previousSibling.nodeType === Node.ELEMENT_NODE &&
				node.previousSibling.getAttribute( 'about' ) === about
			) {
				node = node.previousSibling;
			}

			// 3.
			if (
				node.getAttribute( 'typeof' ) &&
				node.getAttribute( 'typeof' ).split( ' ' ).indexOf( 'mw:Transclusion' ) !== -1
			) {
				break;
			}
		}

		node = node.parentNode;
	}
	return node;
}

/**
 * Given a heading node, return the node on which the ID attribute is set.
 *
 * Also returns the offset within that node where the heading text starts.
 *
 * @param {HTMLElement} heading Heading node (`<h1>`-`<h6>`)
 * @return {Array} Array containing a 'node' (HTMLElement) and offset (number)
 */
function getHeadlineNodeAndOffset( heading ) {
	// This code assumes that $wgFragmentMode is [ 'html5', 'legacy' ] or [ 'html5' ]
	var headline = heading,
		offset = 0;

	if ( headline.hasAttribute( 'data-mw-comment-start' ) ) {
		headline = headline.parentNode;
	}

	if ( !headline.getAttribute( 'id' ) ) {
		// PHP HTML: Find the child with .mw-headline
		headline = headline.querySelector( '.mw-headline' );
		if ( headline ) {
			if ( headline.querySelector( '.mw-headline-number' ) ) {
				offset = 1;
			}
		} else {
			headline = heading;
		}
	}

	return {
		node: headline,
		offset: offset
	};
}

/**
 * Trim ASCII whitespace, as defined in the HTML spec.
 *
 * @param {string} str
 * @return {string}
 */
function htmlTrim( str ) {
	// https://infra.spec.whatwg.org/#ascii-whitespace
	return str.replace( /^[\t\n\f\r ]+/, '' ).replace( /[\t\n\f\r ]+$/, '' );
}

/**
 * Get the indent level of the node, relative to rootNode.
 *
 * The indent level is the number of lists inside of which it is nested.
 *
 * @private
 * @param {Node} node
 * @param {Node} rootNode
 * @return {number}
 */
function getIndentLevel( node, rootNode ) {
	var indent = 0;
	while ( node ) {
		if ( node === rootNode ) {
			break;
		}
		var tagName = node.tagName && node.tagName.toLowerCase();
		if ( tagName === 'li' || tagName === 'dd' ) {
			indent++;
		}
		node = node.parentNode;
	}
	return indent;
}

/**
 * Get an array of sibling nodes that contain parts of the given range.
 *
 * @param {Range} range
 * @return {HTMLElement[]}
 */
function getCoveredSiblings( range ) {
	var ancestor = range.commonAncestorContainer;

	var siblings = ancestor.childNodes;
	var start = 0;
	var end = siblings.length - 1;

	// Find first of the siblings that contains the item
	if ( ancestor === range.startContainer ) {
		start = range.startOffset;
	} else {
		while ( !contains( siblings[ start ], range.startContainer ) ) {
			start++;
		}
	}

	// Find last of the siblings that contains the item
	if ( ancestor === range.endContainer ) {
		end = range.endOffset - 1;
	} else {
		while ( !contains( siblings[ end ], range.endContainer ) ) {
			end--;
		}
	}

	return Array.prototype.slice.call( siblings, start, end + 1 );
}

/**
 * Get the nodes (if any) that contain the given thread item, and nothing else.
 *
 * @param {ThreadItem} item Thread item
 * @return {HTMLElement[]|null}
 */
function getFullyCoveredSiblings( item ) {
	var siblings = getCoveredSiblings( item.getNativeRange() );
	var startContainer = item.range.startContainer;
	var endContainer = item.range.endContainer;
	var startOffset = item.range.startOffset;
	var endOffset = item.range.endOffset;

	function isIgnored( n ) {
		// Ignore empty text nodes, and our own reply buttons
		return ( n.nodeType === Node.TEXT_NODE && htmlTrim( n.textContent ) === '' ) ||
			( n.className && n.className.indexOf( 'ext-discussiontools-init-replylink-buttons' ) !== -1 );
	}

	function isFirstNonemptyChild( n ) {
		while ( ( n = n.previousSibling ) ) {
			if ( !isIgnored( n ) ) {
				return false;
			}
		}
		return true;
	}

	function isLastNonemptyChild( n ) {
		while ( ( n = n.nextSibling ) ) {
			if ( !isIgnored( n ) ) {
				return false;
			}
		}
		return true;
	}

	var startMatches = false;
	var node = siblings[ 0 ];
	while ( node ) {
		if ( startContainer.childNodes && startContainer.childNodes[ startOffset ] === node ) {
			startMatches = true;
			break;
		}
		if ( startContainer === node && startOffset === 0 ) {
			startMatches = true;
			break;
		}
		if ( isIgnored( node ) ) {
			node = node.nextSibling;
		} else {
			node = node.firstChild;
		}
	}

	var endMatches = false;
	node = siblings[ siblings.length - 1 ];
	while ( node ) {
		if ( endContainer.childNodes && endContainer.childNodes[ endOffset - 1 ] === node ) {
			endMatches = true;
			break;
		}
		var length = node.nodeType === Node.TEXT_NODE ?
			node.textContent.replace( /[\t\n\f\r ]+$/, '' ).length :
			node.childNodes.length;
		if ( endContainer === node && endOffset === length ) {
			endMatches = true;
			break;
		}
		if ( isIgnored( node ) ) {
			node = node.previousSibling;
		} else {
			node = node.lastChild;
		}
	}

	if ( startMatches && endMatches ) {
		var parent;
		// If these are all of the children (or the only child), go up one more level
		while (
			( parent = siblings[ 0 ].parentNode ) &&
			isFirstNonemptyChild( siblings[ 0 ] ) &&
			isLastNonemptyChild( siblings[ siblings.length - 1 ] )
		) {
			siblings = [ parent ];
		}
		return siblings;
	}
	return null;
}

/**
 * Get a MediaWiki page title from a URL.
 *
 * @private
 * @param {string} url
 * @return {mw.Title|null} Page title, or null if this isn't a link to a page
 */
function getTitleFromUrl( url ) {
	try {
		url = new mw.Uri( url );
	} catch ( err ) {
		// T106244: URL encoded values using fallback 8-bit encoding (invalid UTF-8) cause mediawiki.Uri to crash
		return null;
	}
	if ( url.query.title ) {
		return mw.Title.newFromText( url.query.title );
	}

	var articlePathRegexp = new RegExp(
		mw.util.escapeRegExp( mw.config.get( 'wgArticlePath' ) )
			.replace( mw.util.escapeRegExp( '$1' ), '(.*)' )
	);
	var match;
	if ( ( match = url.path.match( articlePathRegexp ) ) ) {
		return mw.Title.newFromText( decodeURIComponent( match[ 1 ] ) );
	}

	return null;
}

/**
 * Traverse the document in depth-first order, calling the callback whenever entering and leaving
 * a node. The walk starts before the given node and ends when callback returns a truthy value, or
 * after reaching the end of the document.
 *
 * You might also think about this as processing XML token stream linearly (rather than XML
 * nodes), as if we were parsing the document.
 *
 * @param {Node} node Node to start at
 * @param {Function} callback Function accepting two arguments: `event` ('enter' or 'leave') and
 *     `node` (DOMNode)
 * @return {Mixed} Final return value of the callback
 */
function linearWalk( node, callback ) {
	var
		result = null,
		withinNode = node.parentNode,
		beforeNode = node;

	while ( beforeNode || withinNode ) {
		if ( beforeNode ) {
			result = callback( 'enter', beforeNode );
			withinNode = beforeNode;
			beforeNode = beforeNode.firstChild;
		} else {
			result = callback( 'leave', withinNode );
			beforeNode = withinNode.nextSibling;
			withinNode = withinNode.parentNode;
		}

		if ( result ) {
			return result;
		}
	}
	return result;
}

/**
 * Like #linearWalk, but it goes backwards.
 *
 * @inheritdoc #linearWalk
 */
function linearWalkBackwards( node, callback ) {
	var
		result = null,
		withinNode = node.parentNode,
		beforeNode = node;

	while ( beforeNode || withinNode ) {
		if ( beforeNode ) {
			result = callback( 'enter', beforeNode );
			withinNode = beforeNode;
			beforeNode = beforeNode.lastChild;
		} else {
			result = callback( 'leave', withinNode );
			beforeNode = withinNode.previousSibling;
			withinNode = withinNode.parentNode;
		}

		if ( result ) {
			return result;
		}
	}
	return result;
}

module.exports = {
	NEW_TOPIC_COMMENT_ID: NEW_TOPIC_COMMENT_ID,
	isBlockElement: isBlockElement,
	isRenderingTransparentNode: isRenderingTransparentNode,
	cantHaveElementChildren: cantHaveElementChildren,
	childIndexOf: childIndexOf,
	closestElement: closestElement,
	getIndentLevel: getIndentLevel,
	getCoveredSiblings: getCoveredSiblings,
	getFullyCoveredSiblings: getFullyCoveredSiblings,
	getTranscludedFromElement: getTranscludedFromElement,
	getHeadlineNodeAndOffset: getHeadlineNodeAndOffset,
	htmlTrim: htmlTrim,
	getTitleFromUrl: getTitleFromUrl,
	linearWalk: linearWalk,
	linearWalkBackwards: linearWalkBackwards
};
