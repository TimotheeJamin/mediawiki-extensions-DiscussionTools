var
	// LanguageData::getLocalData()
	parserData = require( './parser/data.json' ),
	utils = require( './utils.js' );
var featuresEnabled = mw.config.get( 'wgDiscussionToolsFeaturesEnabled' ) || {};

function ReplyLinksController( $pageContainer ) {
	// Mixin constructors
	OO.EventEmitter.call( this );

	this.$pageContainer = $pageContainer;
	this.$body = $( document.body );
	this.onReplyLinkClickHandler = this.onReplyLinkClick.bind( this );
	this.onAddSectionLinkClickHandler = this.onAddSectionLinkClick.bind( this );
	this.onAnyLinkClickHandler = this.onAnyLinkClick.bind( this );

	// Reply links
	this.$replyLinks = $pageContainer.find( 'a.ext-discussiontools-init-replylink-reply[data-mw-comment]' );
	this.$replyLinks.on( 'click keypress', this.onReplyLinkClickHandler );

	// "Add topic" link in the skin interface
	if ( featuresEnabled.newtopictool ) {
		// eslint-disable-next-line no-jquery/no-global-selector
		var $addSectionTab = $( '#ca-addsection' );
		if ( $addSectionTab.length ) {
			this.$addSectionLink = $addSectionTab.find( 'a' );
			this.$addSectionLink.on( 'click keypress', this.onAddSectionLinkClickHandler );
		}
		// Handle events on all links that potentially open the new section interface,
		// including links in the page content (from templates) or from gadgets.
		this.$body.on( 'click keypress', 'a:not( [data-mw-comment] )', this.onAnyLinkClickHandler );
	}
}

OO.initClass( ReplyLinksController );
OO.mixinClass( ReplyLinksController, OO.EventEmitter );

/**
 * @event link-click
 * @param {string} id
 * $@param {jQuery} $link
 */

/* Methods */

ReplyLinksController.prototype.onReplyLinkClick = function ( e ) {
	if ( !this.isActivationEvent( e ) ) {
		return;
	}
	e.preventDefault();

	// Browser plugins (such as Google Translate) may add extra tags inside
	// the link, so find the containing link tag with the data we need.
	var $link = $( e.target ).closest( 'a[data-mw-comment]' );
	if ( !$link.length ) {
		return;
	}
	this.emit( 'link-click', $link.data( 'mw-comment' ).id, $link );
};

ReplyLinksController.prototype.onAddSectionLinkClick = function ( e ) {
	if ( !this.isActivationEvent( e ) ) {
		return;
	}
	// Disable VisualEditor's new section editor (in wikitext mode / NWE), to allow our own.
	// We do this on first click, because we don't control the order in which our code and NWE code
	// runs, so its event handlers may not be registered yet.
	$( e.target ).closest( '#ca-addsection' ).off( '.ve-target' );

	// onAnyLinkClick() will also handle clicks on this element, so we don't emit() here to avoid
	// doing it twice.
};

ReplyLinksController.prototype.onAnyLinkClick = function ( e ) {
	// Check query parameters to see if this is really a new topic link
	var href = e.currentTarget.href;
	if ( !href ) {
		return;
	}
	var url = new URL( href );

	var title = mw.Title.newFromText( utils.getTitleFromUrl( href ) || '' );
	if ( !title ) {
		return;
	}

	// Recognize links to add a new topic:
	if (
		// Special:NewSection/...
		title.getNamespaceId() === mw.config.get( 'wgNamespaceIds' ).special &&
		title.getMainText().split( '/' )[ 0 ] === parserData.specialNewSectionName
	) {
		// Get the real title from the subpage parameter
		var param = title.getMainText().slice( parserData.specialNewSectionName.length + 1 );
		title = mw.Title.newFromText( param );
		if ( !title ) {
			return;
		}

	} else if (
		// ?title=...&action=edit&section=new
		// ?title=...&veaction=editsource&section=new
		( url.searchParams.get( 'action' ) === 'edit' || url.searchParams.get( 'veaction' ) === 'editsource' ) &&
		url.searchParams.get( 'section' ) === 'new' &&
		url.searchParams.get( 'dtenable' ) !== '0'
	) {
		// Do nothing

	} else {
		// Not a link to add a new topic
		return;
	}

	if ( title.getPrefixedDb() !== mw.config.get( 'wgRelevantPageName' ) ) {
		// Link to add a section on another page, not supported yet (T282205)
		return;
	}

	if (
		url.searchParams.get( 'editintro' ) || url.searchParams.get( 'preload' ) ||
		url.searchParams.getAll( 'preloadparams[]' ).length || url.searchParams.get( 'preloadtitle' )
	) {
		// Adding a new topic with preloaded text is not supported yet (T269310)
		return;
	}

	if ( !this.isActivationEvent( e ) ) {
		return;
	}
	e.preventDefault();

	this.emit( 'link-click', utils.NEW_TOPIC_COMMENT_ID, $( e.currentTarget ) );
};

ReplyLinksController.prototype.isActivationEvent = function ( e ) {
	if ( mw.config.get( 'wgAction' ) !== 'view' ) {
		// Don't do anything when we're editing/previewing
		return false;
	}
	if ( e.type === 'keypress' && e.which !== OO.ui.Keys.ENTER && e.which !== OO.ui.Keys.SPACE ) {
		// Only handle keypresses on the "Enter" or "Space" keys
		return false;
	}
	if ( e.type === 'click' && !utils.isUnmodifiedLeftClick( e ) ) {
		// Only handle unmodified left clicks
		return false;
	}
	return true;
};

ReplyLinksController.prototype.focusLink = function ( $link ) {
	if ( $link.is( this.$replyLinks ) ) {
		$link.trigger( 'focus' );
	}
};

ReplyLinksController.prototype.setActiveLink = function ( $link ) {
	this.$activeLink = $link;

	if ( this.$activeLink.is( this.$replyLinks ) ) {
		this.$activeLink.closest( '.ext-discussiontools-init-replylink-buttons' )
			.addClass( 'ext-discussiontools-init-replylink-active' );
	} else if ( this.$addSectionLink && this.$activeLink.is( this.$addSectionLink ) ) {
		// eslint-disable-next-line no-jquery/no-global-selector
		$( '#ca-addsection' ).addClass( 'selected' );
		// eslint-disable-next-line no-jquery/no-global-selector
		$( '#ca-view' ).removeClass( 'selected' );
	}

	this.$pageContainer.addClass( 'ext-discussiontools-init-replylink-open' );
	this.$replyLinks.attr( {
		tabindex: '-1'
	} );

	// Suppress page takeover behavior for VE editing so that our unload
	// handler can warn of data loss.
	// eslint-disable-next-line no-jquery/no-global-selector
	$( '#ca-edit, #ca-ve-edit, .mw-editsection a, #ca-addsection' ).off( '.ve-target' );
};

ReplyLinksController.prototype.clearActiveLink = function () {
	if ( this.$activeLink.is( this.$replyLinks ) ) {
		this.$activeLink.closest( '.ext-discussiontools-init-replylink-buttons' )
			.removeClass( 'ext-discussiontools-init-replylink-active' );
	} else if ( this.$addSectionLink && this.$activeLink.is( this.$addSectionLink ) ) {
		// eslint-disable-next-line no-jquery/no-global-selector
		$( '#ca-addsection' ).removeClass( 'selected' );
		// eslint-disable-next-line no-jquery/no-global-selector
		$( '#ca-view' ).addClass( 'selected' );
	}

	this.$pageContainer.removeClass( 'ext-discussiontools-init-replylink-open' );
	this.$replyLinks.attr( {
		tabindex: '0'
	} );

	// We deliberately mangled edit links earlier so VE can't steal our page;
	// have it redo setup to fix those.
	if ( mw.libs.ve && mw.libs.ve.setupEditLinks ) {
		mw.libs.ve.setupEditLinks();
	}

	this.$activeLink = null;
};

ReplyLinksController.prototype.teardown = function () {
	if ( this.$activeLink ) {
		this.clearActiveLink();
	}

	this.$replyLinks.off( 'click keypress', this.onReplyLinkClickHandler );
	if ( featuresEnabled.newtopictool ) {
		if ( this.$addSectionLink ) {
			this.$addSectionLink.off( 'click keypress', this.onAddSectionLinkClickHandler );
		}
		this.$body.off( 'click keypress', 'a:not( [data-mw-comment] )', this.onAnyLinkClickHandler );
	}
};

module.exports = ReplyLinksController;
