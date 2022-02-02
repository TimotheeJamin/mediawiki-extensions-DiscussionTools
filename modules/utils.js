'use strict';
/* global $:off */

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
	var nextSibling = node.nextSibling;
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
				!htmlTrim( node.innerHTML ) &&
				(
					!nextSibling || nextSibling.nodeType !== Node.ELEMENT_NODE ||
					// Maybe we should be checking all of the about-grouped nodes to see if they're empty,
					// but that's prooobably not needed in practice, and it leads to a quadratic worst case.
					nextSibling.getAttribute( 'about' ) !== node.getAttribute( 'about' )
				)
			)
		)
	);
}

/**
 * @param {Node} node
 * @return {boolean} Node was added to the page by DiscussionTools
 */
function isOurGeneratedNode( node ) {
	return node.nodeType === Node.ELEMENT_NODE && (
		node.classList.contains( 'ext-discussiontools-init-replylink-buttons' ) ||
		node.hasAttribute( 'data-mw-comment' ) ||
		node.hasAttribute( 'data-mw-comment-start' ) ||
		node.hasAttribute( 'data-mw-comment-end' )
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
 * Check whether the node is a comment separator (instead of a part of the comment).
 *
 * @param {Node} node
 * @return {boolean}
 */
function isCommentSeparator( node ) {
	return node.nodeType === Node.ELEMENT_NODE && (
		// Empty paragraphs (`<p><br></p>`) between indented comments mess up indentation detection
		node.nodeName.toLowerCase() === 'br' ||
		// Horizontal line
		node.nodeName.toLowerCase() === 'hr' ||
		// {{outdent}} templates
		node.classList.contains( 'outdent-template' )
	);
}

/**
 * Check whether the node is a comment content. It's a little vague what this means…
 *
 * @param {Node} node Node, should be a leaf node (a node with no children)
 * @return {boolean}
 */
function isCommentContent( node ) {
	return (
		// eslint-disable-next-line no-use-before-define
		( node.nodeType === Node.TEXT_NODE && htmlTrim( node.textContent ) !== '' ) ||
		// eslint-disable-next-line no-use-before-define
		( node.nodeType === Node.CDATA_SECTION_NODE && htmlTrim( node.textContent ) !== '' ) ||
		( cantHaveElementChildren( node ) )
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
 * @return {HTMLElement|null} Transclusion node, null if not found
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

	function makeRange( sibs ) {
		var range = sibs[ 0 ].ownerDocument.createRange();
		range.setStartBefore( sibs[ 0 ] );
		range.setEndAfter( sibs[ sibs.length - 1 ] );
		return range;
	}

	// eslint-disable-next-line no-use-before-define
	var matches = compareRanges( makeRange( siblings ), item.getNativeRange() ) === 'equal';

	if ( matches ) {
		// If these are all of the children (or the only child), go up one more level
		var parent;
		while (
			( parent = siblings[ 0 ].parentNode ) &&
			// eslint-disable-next-line no-use-before-define
			compareRanges( makeRange( [ parent ] ), item.getNativeRange() ) === 'equal'
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

/**
 * @param {Range} range
 * @return {Node}
 */
function getRangeFirstNode( range ) {
	return range.startContainer.childNodes.length ?
		range.startContainer.childNodes[ range.startOffset ] :
		range.startContainer;
}

/**
 * @param {Range} range
 * @return {Node}
 */
function getRangeLastNode( range ) {
	return range.endContainer.childNodes.length ?
		range.endContainer.childNodes[ range.endOffset - 1 ] :
		range.endContainer;
}

/**
 * Check whether two ranges overlap, and how.
 *
 * Includes a hack to check for "almost equal" ranges (whose start/end boundaries only differ by
 * "uninteresting" nodes that we ignore when detecting comments), and treat them as equal.
 *
 * Illustration of return values:
 *          [    equal    ]
 *          |[ contained ]|
 *        [ |  contains   | ]
 *  [overlap|start]       |
 *          |     [overlap|end]
 * [before] |             |
 *          |             | [after]
 *
 * @param {Range} a
 * @param {Range} b
 * @return {string} One of:
 *     - 'equal': Ranges A and B are equal
 *     - 'contains': Range A contains range B
 *     - 'contained': Range A is contained within range B
 *     - 'after': Range A is before range B
 *     - 'before': Range A is after range B
 *     - 'overlapstart': Start of range A overlaps range B
 *     - 'overlapend': End of range A overlaps range B
 */
function compareRanges( a, b ) {
	// Compare the positions of: start of A to start of B, start of A to end of B, and so on.
	// Watch out, the constant names are the opposite of what they should be.
	var startToStart = a.compareBoundaryPoints( Range.START_TO_START, b );
	var startToEnd = a.compareBoundaryPoints( Range.END_TO_START, b );
	var endToStart = a.compareBoundaryPoints( Range.START_TO_END, b );
	var endToEnd = a.compareBoundaryPoints( Range.END_TO_END, b );

	// Check for almost equal ranges (boundary points only differing by uninteresting nodes)
	/* eslint-disable no-use-before-define */
	if (
		( startToStart < 0 && compareRangesAlmostEqualBoundaries( a, b, 'start' ) ) ||
		( startToStart > 0 && compareRangesAlmostEqualBoundaries( b, a, 'start' ) )
	) {
		startToStart = 0;
	}
	if (
		( endToEnd < 0 && compareRangesAlmostEqualBoundaries( a, b, 'end' ) ) ||
		( endToEnd > 0 && compareRangesAlmostEqualBoundaries( b, a, 'end' ) )
	) {
		endToEnd = 0;
	}
	/* eslint-enable no-use-before-define */

	if ( startToStart === 0 && endToEnd === 0 ) {
		return 'equal';
	}
	if ( startToStart <= 0 && endToEnd >= 0 ) {
		return 'contains';
	}
	if ( startToStart >= 0 && endToEnd <= 0 ) {
		return 'contained';
	}
	if ( startToEnd >= 0 ) {
		return 'after';
	}
	if ( endToStart <= 0 ) {
		return 'before';
	}
	if ( startToStart > 0 && startToEnd < 0 && endToEnd >= 0 ) {
		return 'overlapstart';
	}
	if ( endToEnd < 0 && endToStart > 0 && startToStart <= 0 ) {
		return 'overlapend';
	}

	throw new Error( 'Unreachable' );
}

/**
 * Check if the given boundary points of ranges A and B are almost equal (only differing by
 * uninteresting nodes).
 *
 * Boundary of A must be before the boundary of B in the tree.
 *
 * @param {Range} a
 * @param {Range} b
 * @param {string} boundary 'start' or 'end'
 * @return {boolean}
 */
function compareRangesAlmostEqualBoundaries( a, b, boundary ) {
	// This code is awful, but several attempts to rewrite it made it even worse.
	// You're welcome to give it a try.

	var from = boundary === 'end' ? getRangeLastNode( a ) : getRangeFirstNode( a );
	var to = boundary === 'end' ? getRangeLastNode( b ) : getRangeFirstNode( b );

	var skipNode = null;
	if ( boundary === 'end' ) {
		skipNode = from;
	}

	var foundContent = false;
	linearWalk(
		from,
		function ( event, n ) {
			if ( n === to && event === ( boundary === 'end' ? 'leave' : 'enter' ) ) {
				return true;
			}
			if ( skipNode ) {
				if ( n === skipNode && event === 'leave' ) {
					skipNode = null;
				}
				return;
			}

			if ( event === 'enter' ) {
				if (
					isCommentSeparator( n ) ||
					isRenderingTransparentNode( n ) ||
					isOurGeneratedNode( n )
				) {
					skipNode = n;

				} else if (
					isCommentContent( n )
				) {
					foundContent = true;
					return true;
				}
			}
		}
	);

	return !foundContent;
}

module.exports = {
	NEW_TOPIC_COMMENT_ID: NEW_TOPIC_COMMENT_ID,
	isBlockElement: isBlockElement,
	isRenderingTransparentNode: isRenderingTransparentNode,
	isCommentSeparator: isCommentSeparator,
	isCommentContent: isCommentContent,
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
	linearWalkBackwards: linearWalkBackwards,
	compareRanges: compareRanges
};
