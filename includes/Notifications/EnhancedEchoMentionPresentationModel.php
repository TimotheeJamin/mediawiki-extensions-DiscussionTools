<?php
/**
 * Our override of the built-in Echo presentation model for user talk page notifications.
 *
 * @file
 * @ingroup Extensions
 * @license MIT
 */

namespace MediaWiki\Extension\DiscussionTools\Notifications;

use EchoMentionPresentationModel;

class EnhancedEchoMentionPresentationModel extends EchoMentionPresentationModel {

	use DiscussionToolsEventTrait;

	/**
	 * @inheritDoc
	 */
	public function getPrimaryLink() {
		$linkInfo = parent::getPrimaryLink();
		// For events enhanced by DiscussionTools: link to the individual comment
		$link = $this->getCommentLink();
		if ( $link ) {
			$linkInfo['url'] = $link;
		}
		return $linkInfo;
	}
}
