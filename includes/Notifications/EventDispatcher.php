<?php
/**
 * DiscussionTools event dispatcher
 *
 * @file
 * @ingroup Extensions
 * @license MIT
 */

namespace MediaWiki\Extension\DiscussionTools\Notifications;

use ApiMain;
use DOMElement;
use EchoEvent;
use Error;
use FauxRequest;
use IDBAccessObject;
use Iterator;
use MediaWiki\Extension\DiscussionTools\CommentParser;
use MediaWiki\Extension\DiscussionTools\Hooks\HookUtils;
use MediaWiki\Extension\DiscussionTools\SubscriptionItem;
use MediaWiki\MediaWikiServices;
use MediaWiki\Revision\RevisionRecord;
use MediaWiki\User\UserIdentity;
use Title;
use Wikimedia\Parsoid\Utils\DOMUtils;

class EventDispatcher {
	/**
	 * @param RevisionRecord $revision
	 * @return CommentParser
	 */
	private static function getParsedRevision( RevisionRecord $revision ) : CommentParser {
		$api = new ApiMain(
			new FauxRequest(
				[
					'action' => 'parse',
					'oldid' => $revision->getId()
				],
				/* was posted? */ true
			),
			/* enable write? */ true
		);

		$api->execute();
		$data = $api->getResult()->getResultData();

		$doc = DOMUtils::parseHTML( $data['parse']['text'] );
		$container = $doc->getElementsByTagName( 'body' )->item( 0 );
		if ( !( $container instanceof DOMElement ) ) {
			throw new Error( 'Could not load revision for notifications' );
		}
		return CommentParser::newFromGlobalState( $container );
	}

	/**
	 * @param array &$events
	 * @param RevisionRecord $newRevRecord
	 */
	public static function generateEventsForRevision( array &$events, RevisionRecord $newRevRecord ) {
		$services = MediaWikiServices::getInstance();
		$dtConfig = $services->getConfigFactory()->makeConfig( 'discussiontools' );

		if ( !$dtConfig->get( 'DiscussionToolsEnableTopicSubscriptionBackend' ) ) {
			// Feature disabled for all users
			return;
		}

		$revisionStore = $services->getRevisionStore();
		$userFactory = $services->getUserFactory();
		$oldRevRecord = $revisionStore->getPreviousRevision( $newRevRecord, IDBAccessObject::READ_LATEST );

		if ( $oldRevRecord === null ) {
			// TODO: Handle page creation (oldRevRecord = null?)
			return;
		}

		$title = Title::newFromLinkTarget(
			$newRevRecord->getPageAsLinkTarget()
		);
		if ( !HookUtils::isAvailableForTitle( $title ) ) {
			// Not a talk page
			return;
		}

		$user = $newRevRecord->getUser();
		if ( !$user ) {
			// User can be null if the user is deleted, but this is unlikely
			// to be the case if the user just made an edit
			return;
		}

		$oldParser = self::getParsedRevision( $oldRevRecord );
		$newParser = self::getParsedRevision( $newRevRecord );

		$newComments = [];
		foreach ( $newParser->getCommentItems() as $newComment ) {
			if (
				$newComment->getAuthor() === $user->getName() &&
				// Compare comments by name, as ID could be changed by a parent comment
				// being moved/deleted. The downside is that multiple replies within the
				// same minute will only fire one notification.
				count( $oldParser->findCommentsByName( $newComment->getName() ) ) === 0
			) {
				$newComments[] = $newComment;
			}
		}

		$mentionedUsers = [];
		foreach ( $events as $event ) {
			if ( $event['type'] === 'mention' || $event['type'] === 'mention-summary' ) {
				// Array is keyed by user id so we can do a simple array merge
				$mentionedUsers += $event['extra']['mentioned-users'];
			}
		}

		foreach ( $newComments as $newComment ) {
			$heading = $newComment->getHeading();
			$events[] = [
				'type' => 'dt-subscribed-new-comment',
				'title' => $title,
				'extra' => [
					'subscribed-comment-name' => $heading->getName(),
					'comment-id' => $newComment->getId(),
					'comment-name' => $newComment->getName(),
					'content' => $newComment->getBodyText( true ),
					'section-title' => $heading->getText(),
					'revid' => $newRevRecord->getId(),
					'mentioned-users' => $mentionedUsers,
				],
				'agent' => $user,
			];
		}
	}

	/**
	 * Return all users subscribed to a comment
	 *
	 * @param EchoEvent $event
	 * @param int $batchSize
	 * @return UserIdentity[]|Iterator<UserIdentity>
	 */
	public static function locateSubscribedUsers( EchoEvent $event, $batchSize = 500 ) {
		$commentName = $event->getExtraParam( 'subscribed-comment-name' );

		$subscriptionStore = MediaWikiServices::getInstance()->getService( 'DiscussionTools.SubscriptionStore' );
		$subscriptionItems = $subscriptionStore->getSubscriptionItemsForTopic(
			$commentName,
			1
		);

		// Update notified timestamps
		$subscriptionStore->updateSubscriptionNotifiedTimestamp(
			null,
			$commentName
		);

		// TODD: Have this return an Iterator instead?
		$users = array_map( static function ( SubscriptionItem $item ) {
			return $item->getUserIdentity();
		}, $subscriptionItems );

		return $users;
	}

}
