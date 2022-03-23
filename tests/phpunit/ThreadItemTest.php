<?php

namespace MediaWiki\Extension\DiscussionTools\Tests;

use DateTimeImmutable;
use MediaWiki\Extension\DiscussionTools\CommentItem;
use MediaWiki\Extension\DiscussionTools\CommentUtils;
use MediaWiki\Extension\DiscussionTools\HeadingItem;
use MediaWiki\Extension\DiscussionTools\ImmutableRange;
use MediaWiki\Extension\DiscussionTools\ThreadItem;
use MediaWiki\MediaWikiServices;

/**
 * @coversDefaultClass \MediaWiki\Extension\DiscussionTools\ThreadItem
 *
 * @group DiscussionTools
 */
class ThreadItemTest extends IntegrationTestCase {
	/**
	 * @dataProvider provideAuthors
	 * @covers ::getAuthorsBelow
	 * @covers ::getThreadItemsBelow
	 */
	public function testGetAuthorsOrThreadItemsBelow(
		array $thread, array $expectedAuthors, array $expectedThreadItemIds
	): void {
		$doc = $this->createDocument( '' );
		$node = $doc->createElement( 'div' );
		$range = new ImmutableRange( $node, 0, $node, 0 );

		$makeThreadItem = static function ( array $arr ) use ( &$makeThreadItem, $range ): ThreadItem {
			if ( $arr['type'] === 'comment' ) {
				$item = new CommentItem( 1, $range, [], new DateTimeImmutable(), $arr['author'] );
			} else {
				$item = new HeadingItem( $range, 2 );
			}
			$item->setId( $arr['id'] );
			foreach ( $arr['replies'] as $reply ) {
				$item->addReply( $makeThreadItem( $reply ) );
			}
			return $item;
		};

		$threadItem = $makeThreadItem( $thread );

		self::assertEquals( $expectedAuthors, $threadItem->getAuthorsBelow() );
		self::assertEquals( $expectedThreadItemIds, array_map( static function ( ThreadItem $threadItem ): string {
			return $threadItem->getId();
		}, $threadItem->getThreadItemsBelow() ) );
	}

	public function provideAuthors(): array {
		return self::getJson( '../cases/authors.json' );
	}

	/**
	 * @dataProvider provideTranscludedFrom
	 * @covers ::getTranscludedFrom
	 * @covers \MediaWiki\Extension\DiscussionTools\CommentUtils::unwrapParsoidSections
	 */
	public function testGetTranscludedFrom(
		string $name, string $title, string $dom, string $expected, string $config, string $data
	): void {
		$dom = self::getHtml( $dom );
		$expectedPath = $expected;
		$expected = self::getJson( $expected );
		$config = self::getJson( $config );
		$data = self::getJson( $data );

		$this->setupEnv( $config, $data );
		$title = MediaWikiServices::getInstance()->getTitleParser()->parseTitle( $title );

		$doc = self::createDocument( $dom );
		$container = self::getThreadContainer( $doc );

		CommentUtils::unwrapParsoidSections( $container );

		$threadItemSet = self::createParser( $data )->parse( $container, $title );
		$comments = $threadItemSet->getCommentItems();

		$transcludedFrom = [];
		foreach ( $comments as $comment ) {
			$transcludedFrom[ $comment->getId() ] = $comment->getTranscludedFrom();
		}

		// Optionally write updated content to the JSON files
		if ( getenv( 'DISCUSSIONTOOLS_OVERWRITE_TESTS' ) ) {
			self::overwriteJsonFile( $expectedPath, $transcludedFrom );
		}

		self::assertEquals(
			$expected,
			$transcludedFrom,
			$name
		);
	}

	public function provideTranscludedFrom(): array {
		return self::getJson( '../cases/transcluded.json' );
	}

	/**
	 * @dataProvider provideGetText
	 * @covers ::getText
	 * @covers \MediaWiki\Extension\DiscussionTools\CommentItem::getBodyText
	 * @covers \MediaWiki\Extension\DiscussionTools\ImmutableRange::cloneContents
	 */
	public function testGetText(
		string $name, string $title, string $dom, string $expected, string $config, string $data
	): void {
		$dom = self::getHtml( $dom );
		$expectedPath = $expected;
		$expected = self::getJson( $expected );
		$config = self::getJson( $config );
		$data = self::getJson( $data );

		$doc = self::createDocument( $dom );
		$container = self::getThreadContainer( $doc );

		$this->setupEnv( $config, $data );
		$title = MediaWikiServices::getInstance()->getTitleParser()->parseTitle( $title );
		$threadItemSet = self::createParser( $data )->parse( $container, $title );
		$items = $threadItemSet->getThreadItems();

		$output = [];
		foreach ( $items as $item ) {
			$output[ $item->getId() ] = CommentUtils::htmlTrim(
				$item instanceof CommentItem ? $item->getBodyText( true ) : $item->getText()
			);
		}

		// Optionally write updated content to the JSON files
		if ( getenv( 'DISCUSSIONTOOLS_OVERWRITE_TESTS' ) ) {
			self::overwriteJsonFile( $expectedPath, $output );
		}

		self::assertEquals(
			$expected,
			$output,
			$name
		);
	}

	public function provideGetText(): array {
		return self::getJson( '../cases/getText.json' );
	}

	/**
	 * @dataProvider provideGetHTML
	 * @covers ::getHTML
	 * @covers \MediaWiki\Extension\DiscussionTools\CommentItem::getBodyHTML
	 * @covers \MediaWiki\Extension\DiscussionTools\ImmutableRange::cloneContents
	 */
	public function testGetHTML(
		string $name, string $title, string $dom, string $expected, string $config, string $data
	): void {
		$dom = self::getHtml( $dom );
		$expectedPath = $expected;
		$expected = self::getJson( $expected );
		$config = self::getJson( $config );
		$data = self::getJson( $data );

		$doc = self::createDocument( $dom );
		$container = self::getThreadContainer( $doc );

		$this->setupEnv( $config, $data );
		$title = MediaWikiServices::getInstance()->getTitleParser()->parseTitle( $title );
		$threadItemSet = self::createParser( $data )->parse( $container, $title );
		$items = $threadItemSet->getThreadItems();

		$output = [];
		foreach ( $items as $item ) {
			$output[ $item->getId() ] = CommentUtils::htmlTrim(
				$item instanceof CommentItem ? $item->getBodyHTML( true ) : $item->getHTML()
			);
		}

		// Optionally write updated content to the JSON files
		if ( getenv( 'DISCUSSIONTOOLS_OVERWRITE_TESTS' ) ) {
			self::overwriteJsonFile( $expectedPath, $output );
		}

		self::assertEquals(
			$expected,
			$output,
			$name
		);
	}

	public function provideGetHTML(): array {
		return self::getJson( '../cases/getHTML.json' );
	}

}
